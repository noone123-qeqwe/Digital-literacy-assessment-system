const DATABASE = 'dlas-knowledge-recovery-v1';
function storage(operation, key, value) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('attempts');
    request.onerror = () => reject(new Error('This browser could not open local recovery storage.'));
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('attempts', operation === 'get' ? 'readonly' : 'readwrite');
      const store = transaction.objectStore('attempts');
      const record = operation === 'get' ? store.get(key) : operation === 'put' ? store.put(value, key) : store.delete(key);
      let result;
      record.onsuccess = () => { result = record.result; };
      transaction.oncomplete = () => { database.close(); resolve(result || null); };
      transaction.onerror = transaction.onabort = () => { database.close(); reject(new Error('Local recovery storage is unavailable or full.')); };
    };
  });
}
const keyFor = (userId, attemptId) => `${userId}:${attemptId}`;
export const readQuizRecovery = (userId, attemptId) => storage('get', keyFor(userId, attemptId));
export const writeQuizRecovery = (userId, attemptId, record) => storage('put', keyFor(userId, attemptId), { ...record, userId, attemptId, savedAt: new Date().toISOString() });
export const clearQuizRecovery = (userId, attemptId) => storage('delete', keyFor(userId, attemptId));

export function downloadQuizRecovery(record) {
  const file = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `Knowledge_Assessment_Recovery_${record.attemptId}.json`;
  document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
