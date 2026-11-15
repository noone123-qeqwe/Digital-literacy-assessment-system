const DATABASE_NAME = 'dlas-offline-responses';
const DATABASE_VERSION = 2;
const RESPONSE_STORE = 'responses';
const CHECKPOINT_STORE = 'attempt-checkpoints';

function openQueue() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('This browser does not support local response backups.'));
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RESPONSE_STORE)) database.createObjectStore(RESPONSE_STORE, { keyPath: 'key' });
      if (!database.objectStoreNames.contains(CHECKPOINT_STORE)) database.createObjectStore(CHECKPOINT_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local response storage.'));
    request.onblocked = () => reject(new Error('Close another DLAS tab to update its local backup storage.'));
  });
}

function createTransaction(database, storeName, mode) {
  if (mode === 'readwrite') {
    try {
      return database.transaction(storeName, mode, { durability: 'strict' });
    } catch {
      // Older browsers do not accept the durability option.
    }
  }
  return database.transaction(storeName, mode);
}

const recordKey = (userId, attemptId, questionId) => `${userId}:${attemptId}:${questionId}`;
const checkpointKey = (userId, assessmentId) => `${userId}:${assessmentId}`;

function saveCheckpointRecord(database, checkpoint) {
  return new Promise((resolve, reject) => {
    const transaction = createTransaction(database, CHECKPOINT_STORE, 'readwrite');
    transaction.objectStore(CHECKPOINT_STORE).put(checkpoint);
    transaction.oncomplete = () => { database.close(); resolve(checkpoint); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error('Could not save the local assessment backup.')); };
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error('Could not save the local assessment backup.')); };
  });
}

export async function requestPersistentLocalStorage() {
  const storage = navigator.storage;
  if (!storage) return { supported: false, persisted: false };
  try {
    let persisted = await storage.persisted?.();
    if (!persisted && storage.persist) persisted = await storage.persist();
    return { supported: true, persisted: Boolean(persisted) };
  } catch {
    return { supported: true, persisted: false };
  }
}

export async function saveAttemptCheckpoint({ userId, assessmentId, attempt, assessment, questions, desiredSkills, pendingQuestionIds = [], desiredSkillsPending = false }) {
  const numericUserId = Number(userId);
  const numericAssessmentId = Number(assessmentId);
  if (!Number.isInteger(numericUserId) || !Number.isInteger(numericAssessmentId) || !attempt?.id) {
    throw new Error('The assessment backup is missing its account or attempt reference.');
  }

  let responseScales;
  try {
    const snapshot = typeof assessment?.instrument_snapshot === 'string'
      ? JSON.parse(assessment.instrument_snapshot)
      : assessment?.instrument_snapshot;
    responseScales = snapshot?.responseScales;
  } catch {
    responseScales = undefined;
  }

  const checkpoint = {
    key: checkpointKey(numericUserId, numericAssessmentId),
    userId: numericUserId,
    assessmentId: numericAssessmentId,
    attemptId: Number(attempt.id),
    attempt: {
      id: Number(attempt.id),
      assessment_id: numericAssessmentId,
      status: String(attempt.status || 'in_progress'),
      started_at: attempt.started_at || null,
      desired_skills: String(attempt.desired_skills || ''),
    },
    assessment: {
      id: numericAssessmentId,
      title: String(assessment?.title || 'Digital Literacy Assessment'),
      description: String(assessment?.description || ''),
      time_limit_minutes: Number(assessment?.time_limit_minutes) || null,
      scoring_version: assessment?.scoring_version || attempt.scoring_version || null,
      instrument_snapshot: responseScales ? { responseScales } : null,
    },
    questions: (questions || []).map((question) => ({
      id: Number(question.id),
      question_number: Number(question.question_number),
      question_text: String(question.question_text || ''),
      area_code: String(question.area_code || ''),
      area_name: String(question.area_name || ''),
      response_type: question.response_type || null,
      saved_rating: question.saved_rating === null || question.saved_rating === undefined
        ? null
        : Number(question.saved_rating),
    })),
    desiredSkills: String(desiredSkills ?? attempt.desired_skills ?? ''),
    pendingQuestionIds: [...new Set(pendingQuestionIds.map(Number))],
    desiredSkillsPending: Boolean(desiredSkillsPending),
    savedAt: new Date().toISOString(),
  };
  const database = await openQueue();
  return saveCheckpointRecord(database, checkpoint);
}

export async function loadAttemptCheckpoint(userId, assessmentId) {
  const database = await openQueue();
  return new Promise((resolve, reject) => {
    const transaction = createTransaction(database, CHECKPOINT_STORE, 'readonly');
    const request = transaction.objectStore(CHECKPOINT_STORE).get(checkpointKey(Number(userId), Number(assessmentId)));
    request.onsuccess = () => resolve(request.result || null);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error('Could not read the local assessment backup.')); };
  });
}

export async function saveAttemptDraftField({ userId, assessmentId, field, value }) {
  if (field !== 'desiredSkills') throw new Error('Unsupported local assessment draft field.');
  const database = await openQueue();
  return new Promise((resolve, reject) => {
    const transaction = createTransaction(database, CHECKPOINT_STORE, 'readwrite');
    const store = transaction.objectStore(CHECKPOINT_STORE);
    const request = store.get(checkpointKey(Number(userId), Number(assessmentId)));
    let saved = false;
    request.onsuccess = () => {
      if (!request.result) return;
      const checkpoint = request.result;
      checkpoint[field] = String(value ?? '');
      checkpoint.desiredSkillsPending = true;
      checkpoint.savedAt = new Date().toISOString();
      store.put(checkpoint);
      saved = true;
    };
    transaction.oncomplete = () => { database.close(); resolve(saved); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error('Could not save the local assessment backup.')); };
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error('Could not save the local assessment backup.')); };
  });
}

export async function markAttemptDraftSynced({ userId, assessmentId, field, value }) {
  if (field !== 'desiredSkills') throw new Error('Unsupported local assessment draft field.');
  const database = await openQueue();
  return new Promise((resolve, reject) => {
    const transaction = createTransaction(database, CHECKPOINT_STORE, 'readwrite');
    const store = transaction.objectStore(CHECKPOINT_STORE);
    const request = store.get(checkpointKey(Number(userId), Number(assessmentId)));
    request.onsuccess = () => {
      if (!request.result) return;
      const checkpoint = request.result;
      checkpoint[field] = String(value ?? '');
      checkpoint.desiredSkillsPending = false;
      checkpoint.savedAt = new Date().toISOString();
      store.put(checkpoint);
    };
    transaction.oncomplete = () => { database.close(); resolve(Boolean(request.result)); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error('Could not update the local assessment backup.')); };
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error('Could not update the local assessment backup.')); };
  });
}

export async function updateAttemptCheckpointResponse({ userId, assessmentId, questionId, rating, pending = true }) {
  const database = await openQueue();
  return new Promise((resolve, reject) => {
    const transaction = createTransaction(database, CHECKPOINT_STORE, 'readwrite');
    const store = transaction.objectStore(CHECKPOINT_STORE);
    const request = store.get(checkpointKey(Number(userId), Number(assessmentId)));
    let saved = false;
    request.onsuccess = () => {
      if (!request.result) { saved = !pending; return; }
      const checkpoint = request.result;
      const question = checkpoint.questions.find((item) => item.id === Number(questionId));
      if (!question) { saved = !pending; return; }
      const pendingQuestionIds = new Set((checkpoint.pendingQuestionIds || []).map(Number));
      if (pending) {
        question.saved_rating = Number(rating);
        pendingQuestionIds.add(Number(questionId));
      } else {
        if (question.saved_rating !== Number(rating)) return;
        pendingQuestionIds.delete(Number(questionId));
      }
      checkpoint.pendingQuestionIds = [...pendingQuestionIds];
      checkpoint.savedAt = new Date().toISOString();
      store.put(checkpoint);
      saved = true;
    };
    transaction.oncomplete = () => { database.close(); resolve(saved); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error('Could not update the local assessment backup.')); };
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error('Could not update the local assessment backup.')); };
  });
}

export async function clearAttemptCheckpoint(userId, assessmentId) {
  const database = await openQueue();
  return new Promise((resolve, reject) => {
    const transaction = createTransaction(database, CHECKPOINT_STORE, 'readwrite');
    transaction.objectStore(CHECKPOINT_STORE).delete(checkpointKey(Number(userId), Number(assessmentId)));
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error('Could not clear the local assessment backup.')); };
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error('Could not clear the local assessment backup.')); };
  });
}

export async function markCheckpointResponseSynced({ userId, assessmentId, questionId, rating }) {
  return updateAttemptCheckpointResponse({ userId, assessmentId, questionId, rating, pending: false });
}

export async function saveQueuedResponse({ userId, assessmentId, attemptId, questionId, rating }) {
  const database = await openQueue();
  return new Promise((resolve, reject) => {
    const transaction = createTransaction(database, RESPONSE_STORE, 'readwrite');
    const store = transaction.objectStore(RESPONSE_STORE);
    const key = recordKey(userId, attemptId, questionId);
    const read = store.get(key);
    let savedRecord;
    read.onsuccess = () => {
      savedRecord = { key, userId: Number(userId), assessmentId: Number(assessmentId), attemptId: Number(attemptId), questionId: Number(questionId), rating: Number(rating), revision: Math.max(Date.now(), Number(read.result?.revision || 0) + 1), queuedAt: new Date().toISOString() };
      store.put(savedRecord);
    };
    transaction.oncomplete = () => { database.close(); resolve(savedRecord); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error('Could not save your response on this device.')); };
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error('Could not save your response on this device.')); };
  });
}

export async function listQueuedResponses(userId, attemptId) {
  const database = await openQueue();
  return new Promise((resolve, reject) => {
    const transaction = createTransaction(database, RESPONSE_STORE, 'readonly');
    const request = transaction.objectStore(RESPONSE_STORE).getAll();
    request.onsuccess = () => resolve(request.result.filter((item) => item.userId === Number(userId) && item.attemptId === Number(attemptId)));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error('Could not read saved responses from this device.')); };
  });
}

export async function removeQueuedResponse(record) {
  const database = await openQueue();
  return new Promise((resolve, reject) => {
    const transaction = createTransaction(database, RESPONSE_STORE, 'readwrite');
    const store = transaction.objectStore(RESPONSE_STORE);
    const request = store.get(record.key || recordKey(record.userId, record.attemptId, record.questionId));
    let removed = false;
    request.onsuccess = () => {
      if (request.result?.revision === record.revision) {
        store.delete(request.result.key);
        removed = true;
      }
    };
    transaction.oncomplete = () => { database.close(); resolve(removed); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error('Could not update local response storage.')); };
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error('Could not update local response storage.')); };
  });
}

export async function clearQueuedResponses(userId, assessmentId) {
  const database = await openQueue();
  return new Promise((resolve, reject) => {
    const transaction = createTransaction(database, RESPONSE_STORE, 'readwrite');
    const store = transaction.objectStore(RESPONSE_STORE);
    const request = store.getAll();
    let removedCount = 0;
    request.onsuccess = () => {
      for (const item of request.result) {
        if (item.userId === Number(userId) && item.assessmentId === Number(assessmentId)) {
          store.delete(item.key);
          removedCount += 1;
        }
      }
    };
    transaction.oncomplete = () => { database.close(); resolve(removedCount); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error('Could not clear local response storage.')); };
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error('Could not clear local response storage.')); };
  });
}
