import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ProgressBar from '../../components/common/ProgressBar';
import Modal from '../../components/common/Modal';
import {
  CheckCircle2,
  Clock,
  ArrowRight,
  Send,
  HelpCircle,
  Database,
  MessageSquare,
  FileCode,
  ShieldCheck,
  Wrench,
  Info,
  ShieldCheck as ConsentShield
} from 'lucide-react';
import { ratingScale, competenceAreas, formatTime } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/useAuth';
import {
  clearAttemptCheckpoint,
  clearQueuedResponses,
  listQueuedResponses,
  loadAttemptCheckpoint,
  markAttemptDraftSynced,
  markCheckpointResponseSynced,
  removeQueuedResponse,
  requestPersistentLocalStorage,
  saveAttemptCheckpoint,
  saveAttemptDraftField,
  saveQueuedResponse,
  updateAttemptCheckpointResponse,
} from '../../utils/offlineResponseQueue';

export const TakeAssessment = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentUserId = user?.id;

  const [loading, setLoading] = useState(true);
  const [assessment, setAssessment] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [responses, setResponses] = useState({}); // { [question_id]: rating }
  const [savingIds, setSavingIds] = useState(() => new Set());
  const [savedIds, setSavedIds] = useState(() => new Set());
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [activeDomain, setActiveDomain] = useState('ALL'); // 'ALL', 'IDL', 'CC', 'DCC', 'S', 'PS'
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [consentInfo, setConsentInfo] = useState(null);
  const [consentForm, setConsentForm] = useState({ participantName: '', participantAge: '', participantConfirmed: false, guardianName: '', guardianRelationship: '', guardianEmail: '' });
  const [consentSubmitting, setConsentSubmitting] = useState(false);
  const [guardianPending, setGuardianPending] = useState(false);
  const [desiredSkills, setDesiredSkills] = useState('');
  const [desiredSkillsDirty, setDesiredSkillsDirty] = useState(false);
  const [desiredSkillsSaving, setDesiredSkillsSaving] = useState(false);
  const [desiredSkillsSaved, setDesiredSkillsSaved] = useState(false);
  const [desiredSkillsLocalSaved, setDesiredSkillsLocalSaved] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [offlineQueueIds, setOfflineQueueIds] = useState(() => new Set());
  const [syncingQueue, setSyncingQueue] = useState(false);
  const [syncConnectionError, setSyncConnectionError] = useState(false);
  const [syncBlockedReason, setSyncBlockedReason] = useState('');
  const [syncRequest, setSyncRequest] = useState(0);
  const [isOfflineRecovery, setIsOfflineRecovery] = useState(false);
  const [localBackupStatus, setLocalBackupStatus] = useState('checking');
  const [initializationMessage, setInitializationMessage] = useState('');
  const desiredSkillsRef = useRef('');
  const pendingSavesRef = useRef(new Map());
  const responseVersionsRef = useRef(new Map());
  const savedVersionsRef = useRef(new Map());
  const queueRevisionRef = useRef(new Map());
  const responsesRef = useRef({});
  const syncingQueueRef = useRef(false);
  const desiredSkillsSaveRef = useRef(Promise.resolve());
  const desiredSkillsSavedValueRef = useRef('');
  const consentIsMinor = Boolean(consentInfo?.isMinor || (Number(consentForm.participantAge) > 0 && Number(consentForm.participantAge) < 18));

  const saveDesiredSkills = useCallback((value) => {
    const request = desiredSkillsSaveRef.current.catch(() => undefined)
      .then(() => api.put(`/attempts/${attempt.id}/desired-skills`, { desired_skills: value }));
    desiredSkillsSaveRef.current = request;
    return request;
  }, [attempt]);

  useEffect(() => {
    if (!attempt?.started_at || !assessment?.time_limit_minutes) {
      return undefined;
    }
    const updateRemaining = () => {
      const source = String(attempt.started_at);
      const startedAt = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(source) ? source : `${source.replace(' ', 'T')}Z`);
      const remaining = Number.isFinite(startedAt)
        ? Math.max(0, Math.ceil((startedAt + assessment.time_limit_minutes * 60_000 - Date.now()) / 1000))
        : null;
      setRemainingSeconds(remaining);
    };
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [attempt?.started_at, assessment?.time_limit_minutes]);

  const initAttempt = useCallback(async () => {
    const hydrateAttempt = async ({ att, asm, qs, checkpoint: providedCheckpoint }, fromLocalBackup = false) => {
      let checkpoint = providedCheckpoint || null;
      if (!checkpoint && currentUserId) {
        try { checkpoint = await loadAttemptCheckpoint(currentUserId, id); } catch { checkpoint = null; }
      }
      if (Number(checkpoint?.attemptId) !== Number(att.id)) checkpoint = null;
      const savedMap = {};
      const savedQuestionIds = new Set();
      for (const question of qs) {
        if (question.saved_rating) {
          savedMap[question.id] = question.saved_rating;
          savedQuestionIds.add(question.id);
        }
      }
      const pendingCheckpointQuestionIds = new Set((checkpoint?.pendingQuestionIds || []).map(Number));
      for (const question of qs) {
        if (pendingCheckpointQuestionIds.has(Number(question.id)) && checkpoint.questions?.some((cachedQuestion) => Number(cachedQuestion.id) === Number(question.id))) {
          const cachedQuestion = checkpoint.questions.find((item) => Number(item.id) === Number(question.id));
          if (cachedQuestion?.saved_rating) {
            savedMap[question.id] = cachedQuestion.saved_rating;
            savedQuestionIds.delete(question.id);
          }
        }
      }
      let queued = [];
      try {
        queued = await listQueuedResponses(currentUserId, att.id);
      } catch {
        setLocalBackupStatus('unavailable');
      }
      const queuedByQuestion = new Map(queued.map((item) => [Number(item.questionId), item]));
      for (const questionId of pendingCheckpointQuestionIds) {
        if (queuedByQuestion.has(questionId)) continue;
        const cachedQuestion = checkpoint?.questions?.find((item) => Number(item.id) === questionId);
        if (!cachedQuestion?.saved_rating || !qs.some((question) => Number(question.id) === questionId)) continue;
        try {
          const queuedRecord = await saveQueuedResponse({
            userId: currentUserId,
            assessmentId: id,
            attemptId: att.id,
            questionId,
            rating: cachedQuestion.saved_rating,
          });
          queued.push(queuedRecord);
          queuedByQuestion.set(questionId, queuedRecord);
        } catch {
          setLocalBackupStatus('unavailable');
        }
      }
      for (const item of queued) {
        if (qs.some((question) => question.id === item.questionId)) savedMap[item.questionId] = item.rating;
      }
      const queuedQuestionIds = new Set(queued.map((item) => item.questionId));
      for (const questionId of queuedQuestionIds) savedQuestionIds.delete(questionId);

      const serverDesiredSkills = att.desired_skills || '';
      const hasPendingLocalDraft = Boolean(checkpoint?.desiredSkillsPending);
      const restoredDesiredSkills = hasPendingLocalDraft || fromLocalBackup
        ? String(checkpoint?.desiredSkills ?? serverDesiredSkills)
        : serverDesiredSkills;
      setAttempt(att);
      setAssessment(asm);
      setQuestions(qs);
      setDesiredSkills(restoredDesiredSkills);
      desiredSkillsRef.current = restoredDesiredSkills;
      desiredSkillsSavedValueRef.current = serverDesiredSkills;
      setDesiredSkillsDirty(Boolean(hasPendingLocalDraft || (fromLocalBackup && restoredDesiredSkills !== serverDesiredSkills)));
      setDesiredSkillsSaved(restoredDesiredSkills === serverDesiredSkills && Boolean(serverDesiredSkills));
      setDesiredSkillsLocalSaved(Boolean(checkpoint));
      setResponses(savedMap);
      responsesRef.current = savedMap;
      setSavedIds(savedQuestionIds);
      const initialVersions = new Map([...savedQuestionIds].map((questionId) => [questionId, 0]));
      for (const item of queued) initialVersions.set(item.questionId, item.revision);
      responseVersionsRef.current = initialVersions;
      savedVersionsRef.current = new Map(initialVersions);
      for (const item of queued) savedVersionsRef.current.delete(item.questionId);
      queueRevisionRef.current = new Map(queued.map((item) => [item.questionId, item.revision]));
      setOfflineQueueIds(queuedQuestionIds);
      setIsOfflineRecovery(fromLocalBackup);
      pendingSavesRef.current = new Map();

      if (!fromLocalBackup) {
        try {
          const storage = await requestPersistentLocalStorage();
          setLocalBackupStatus(storage.persisted ? 'protected' : 'best-effort');
          await saveAttemptCheckpoint({
            userId: currentUserId,
            assessmentId: id,
            attempt: att,
            assessment: asm,
            questions: qs.map((question) => ({ ...question, saved_rating: savedMap[question.id] || null })),
            desiredSkills: restoredDesiredSkills,
            pendingQuestionIds: [...new Set([
              ...pendingCheckpointQuestionIds,
              ...queuedQuestionIds,
            ])],
            desiredSkillsPending: hasPendingLocalDraft,
          });
          setDesiredSkillsLocalSaved(true);
        } catch {
          setLocalBackupStatus('unavailable');
          setDesiredSkillsLocalSaved(false);
        }
      } else {
        setLocalBackupStatus('restored');
      }
    };

    try {
      // Start or retrieve attempt
      const res = await api.post('/attempts', { assessment_id: parseInt(id) });
      if (res.data.success) {
        const { attempt: att, assessment: asm, questions: qs, alreadyCompleted } = res.data.data;

        if (alreadyCompleted) {
          await Promise.allSettled([
            clearQueuedResponses(currentUserId, id),
            clearAttemptCheckpoint(currentUserId, id),
          ]);
          toast.success('Assessment was already submitted');
          navigate(`/respondent/assessments/${att.id}/results`);
          return;
        }
        await hydrateAttempt({ att, asm, qs });
      }
    } catch (error) {
      if (error.response?.status === 428 && error.response?.data?.profileRequired) {
        toast.success('Consent recorded. Complete your study profile to continue.');
        navigate(`/respondent/profile?returnTo=${encodeURIComponent(`/respondent/assessments/${id}/take`)}`);
        return;
      }
      if (error.response?.status === 428 && error.response?.data?.consentRequired) {
        const info = error.response.data;
        setConsentInfo(info);
        setGuardianPending(Boolean(info.guardianPending));
        setConsentForm((current) => ({
          ...current,
          participantName: current.participantName || info.participantName || '',
          participantAge: current.participantAge || (info.participantAge ? String(info.participantAge) : ''),
        }));
        return;
      }
      if ((!error.response || error.response.status >= 500) && currentUserId) {
        try {
          const checkpoint = await loadAttemptCheckpoint(currentUserId, id);
          if (checkpoint?.attempt?.status === 'in_progress' && checkpoint.questions?.length) {
            await hydrateAttempt({
              att: checkpoint.attempt,
              asm: checkpoint.assessment,
              qs: checkpoint.questions,
              checkpoint,
            }, true);
            setInitializationMessage('The server is unreachable. Your saved assessment backup has been restored on this device. Reconnect before submitting.');
            return;
          }
        } catch {
          setLocalBackupStatus('unavailable');
        }
        setInitializationMessage('The assessment server is unavailable and there is no usable local backup on this device. Reconnect and try again.');
        return;
      }
      toast.error('Failed to initialize assessment');
      navigate('/respondent/dashboard');
    } finally {
      setLoading(false);
    }
  }, [id, navigate, currentUserId]);

  useEffect(() => {
    initAttempt();
  }, [initAttempt]);

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  useEffect(() => {
    if (!attempt?.id || offlineQueueIds.size === 0 || !isOnline || syncBlockedReason) return undefined;
    const retryTimer = window.setInterval(() => setSyncRequest((current) => current + 1), 15000);
    return () => window.clearInterval(retryTimer);
  }, [attempt?.id, isOnline, offlineQueueIds.size, syncBlockedReason]);

  useEffect(() => {
    if (!attempt?.id || !currentUserId || !isOnline || syncingQueueRef.current) return undefined;
    let cancelled = false;
    const syncQueue = async () => {
      syncingQueueRef.current = true;
      setSyncingQueue(true);
      try {
        for (let pass = 0; pass < 10 && !cancelled; pass += 1) {
          let queued = await listQueuedResponses(currentUserId, attempt.id);
          const checkpoint = await loadAttemptCheckpoint(currentUserId, id).catch(() => null);
          if (Number(checkpoint?.attemptId) === Number(attempt.id)) {
            const queuedQuestionIds = new Set(queued.map((item) => Number(item.questionId)));
            for (const questionId of checkpoint.pendingQuestionIds || []) {
              if (queuedQuestionIds.has(Number(questionId))) continue;
              const cachedQuestion = checkpoint.questions.find((question) => Number(question.id) === Number(questionId));
              if (!cachedQuestion?.saved_rating) continue;
              const recoveredRecord = await saveQueuedResponse({ userId: currentUserId, assessmentId: id, attemptId: attempt.id, questionId, rating: cachedQuestion.saved_rating });
              queued.push(recoveredRecord);
              queueRevisionRef.current.set(Number(questionId), recoveredRecord.revision);
            }
          }
          setOfflineQueueIds(new Set(queued.map((item) => item.questionId)));
          if (!queued.length) break;
          for (const item of queued) {
            if (cancelled || !navigator.onLine) return;
            try {
              await api.put(`/attempts/${attempt.id}/respond`, { question_id: item.questionId, rating: item.rating });
              const checkpointSynced = await markCheckpointResponseSynced({ userId: currentUserId, assessmentId: id, questionId: item.questionId, rating: item.rating });
              if (!checkpointSynced) throw new Error('Local recovery copy could not be updated yet.');
              setSyncBlockedReason('');
              const removed = await removeQueuedResponse(item);
              const currentVersion = responseVersionsRef.current.get(item.questionId);
              if (removed && queueRevisionRef.current.get(item.questionId) === item.revision && responsesRef.current[item.questionId] === item.rating) {
                queueRevisionRef.current.delete(item.questionId);
                savedVersionsRef.current.set(item.questionId, currentVersion);
                setSavedIds((previous) => new Set(previous).add(item.questionId));
                setOfflineQueueIds((previous) => { const next = new Set(previous); next.delete(item.questionId); return next; });
              }
            } catch (error) {
              setSyncConnectionError(true);
              if (error.response?.status === 410) setSyncBlockedReason('The time limit ended while this device was offline. Your local answers remain saved; contact your instructor to reopen the attempt so they can sync.');
              return;
            }
          }
        }
        const remaining = await listQueuedResponses(currentUserId, attempt.id);
        setOfflineQueueIds(new Set(remaining.map((item) => item.questionId)));
        if (remaining.length === 0) {
          setSyncConnectionError(false);
          if (isOfflineRecovery) {
            setIsOfflineRecovery(false);
            setInitializationMessage('');
            setLocalBackupStatus((current) => current === 'restored' ? 'protected' : current);
          }
        }
      } catch {
        // The durable queue remains available for a later online retry.
        setSyncConnectionError(true);
      } finally {
        syncingQueueRef.current = false;
        if (!cancelled) setSyncingQueue(false);
      }
    };
    syncQueue();
    return () => { cancelled = true; };
  }, [attempt?.id, currentUserId, id, isOfflineRecovery, isOnline, syncRequest]);

  useEffect(() => {
    if (!guardianPending) return undefined;
    const checkGuardian = async () => {
      try {
        const response = await api.get(`/consents/${id}/status`);
        if (response.data?.data?.guardianConfirmed) {
          setGuardianPending(false);
          setConsentInfo(null);
          setLoading(true);
          await initAttempt();
        }
      } catch {
        // Keep the pending state visible; a later poll can recover after a network interruption.
      }
    };
    const timer = window.setInterval(checkGuardian, 7000);
    checkGuardian();
    return () => window.clearInterval(timer);
  }, [guardianPending, id, initAttempt]);

  useEffect(() => {
    if (!attempt || !desiredSkillsDirty || !isOnline) return undefined;
    const valueToSave = desiredSkills;
    const timer = window.setTimeout(async () => {
      setDesiredSkillsSaving(true);
      try {
        await saveDesiredSkills(valueToSave);
        if (desiredSkillsRef.current === valueToSave) {
          await markAttemptDraftSynced({ userId: currentUserId, assessmentId: id, field: 'desiredSkills', value: valueToSave })
            .catch(() => setLocalBackupStatus('unavailable'));
          desiredSkillsSavedValueRef.current = valueToSave;
          setDesiredSkillsDirty(false);
          setDesiredSkillsSaved(true);
          setDesiredSkillsLocalSaved(true);
        }
      } catch {
        setDesiredSkillsSaved(false);
        toast.error('Could not save Part III. Check your connection and try again.');
      } finally {
        setDesiredSkillsSaving(desiredSkillsSavedValueRef.current !== desiredSkillsRef.current);
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [attempt, currentUserId, desiredSkills, desiredSkillsDirty, id, isOnline, saveDesiredSkills]);

  const handleConsentSubmit = async (event) => {
    event.preventDefault();
    if (!consentForm.participantAge) return;
    setConsentSubmitting(true);
    try {
      const response = await api.post(`/consents/${id}`, {
        participant_name: consentForm.participantName,
        participant_age: Number(consentForm.participantAge),
        participant_confirmed: consentForm.participantConfirmed,
        guardian_name: consentForm.guardianName,
        guardian_relationship: consentForm.guardianRelationship,
        guardian_email: consentForm.guardianEmail,
      });
      if (response.data.guardianVerificationPending) {
        setGuardianPending(true);
        toast.success('Student assent recorded. Check for the guardian confirmation email.');
      } else {
        toast.success('Consent recorded. You can begin.');
        setConsentInfo(null);
        setLoading(true);
        await initAttempt();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to record consent.');
    } finally {
      setConsentSubmitting(false);
    }
  };

  const handleWithdraw = async () => {
    setWithdrawing(true);
    try {
      const response = await api.delete(`/consents/${id}`);
      await clearQueuedResponses(currentUserId, id).catch(() => toast.error('Your withdrawal is complete, but this browser could not clear its local saved-answer queue. Clear this site’s storage before leaving the device.'));
      await clearAttemptCheckpoint(currentUserId, id).catch(() => toast.error('Your withdrawal is complete, but this browser could not clear its local assessment backup. Clear this site’s storage before leaving the device.'));
      setOfflineQueueIds(new Set());
      toast.success(response.data?.message || 'Your participation was withdrawn.');
      navigate('/respondent/assessments');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to withdraw from this assessment.');
      setWithdrawing(false);
      setIsWithdrawModalOpen(false);
    }
  };

  const handleRatingSelect = async (questionId, rating) => {
    const version = (responseVersionsRef.current.get(questionId) || 0) + 1;
    responseVersionsRef.current.set(questionId, version);
    savedVersionsRef.current.delete(questionId);
    // Update local state immediately for snappy UI
    setResponses((prev) => ({ ...prev, [questionId]: rating }));
    responsesRef.current = { ...responsesRef.current, [questionId]: rating };
    setSavingIds((prev) => new Set(prev).add(questionId));
    setSavedIds((prev) => {
      const next = new Set(prev);
      next.delete(questionId);
      return next;
    });

    const previousSave = pendingSavesRef.current.get(questionId) || Promise.resolve();
    let queuedRecord = null;
    let queueWriteFailed = false;
    const saveTask = previousSave.catch(() => undefined).then(async () => {
      try {
        queuedRecord = await saveQueuedResponse({ userId: currentUserId, assessmentId: id, attemptId: attempt.id, questionId, rating });
        queueRevisionRef.current.set(questionId, queuedRecord.revision);
        setOfflineQueueIds((previous) => new Set(previous).add(questionId));
      } catch {
        queueWriteFailed = true;
        if (navigator.onLine) setSyncConnectionError(true);
      }

      let checkpointSaved = false;
      try {
        checkpointSaved = await updateAttemptCheckpointResponse({ userId: currentUserId, assessmentId: id, questionId, rating });
      } catch {
        setLocalBackupStatus('unavailable');
      }
      if (!checkpointSaved) setLocalBackupStatus('unavailable');
      else setLocalBackupStatus((current) => current === 'unavailable' ? 'best-effort' : current);
      if (!queuedRecord && checkpointSaved) setOfflineQueueIds((previous) => new Set(previous).add(questionId));
      if (queueWriteFailed && !checkpointSaved && !navigator.onLine) throw new Error('Could not save the answer on this device.');

      await api.put(`/attempts/${attempt.id}/respond`, { question_id: questionId, rating });
      setSyncConnectionError(false);
      setSyncBlockedReason('');
      let checkpointAcknowledged = false;
      try {
        checkpointAcknowledged = await markCheckpointResponseSynced({ userId: currentUserId, assessmentId: id, questionId, rating });
      } catch {
        setLocalBackupStatus('unavailable');
      }
      if (!checkpointAcknowledged) setLocalBackupStatus('unavailable');
      if (queuedRecord) {
        if (!checkpointAcknowledged) return;
        const removed = await removeQueuedResponse(queuedRecord);
        if (!removed) return;
        if (queueRevisionRef.current.get(questionId) === queuedRecord.revision) {
          queueRevisionRef.current.delete(questionId);
          setOfflineQueueIds((previous) => { const next = new Set(previous); next.delete(questionId); return next; });
        }
      }
      if (responseVersionsRef.current.get(questionId) === version) {
        savedVersionsRef.current.set(questionId, version);
        setSavedIds((previous) => new Set(previous).add(questionId));
      }
    });
    pendingSavesRef.current.set(questionId, saveTask);

    try {
      await saveTask;
    } catch {
      if (navigator.onLine) setSyncConnectionError(true);
      if (responseVersionsRef.current.get(questionId) === version) {
        setSavedIds((prev) => {
          const next = new Set(prev);
          next.delete(questionId);
          return next;
        });
        toast.error(navigator.onLine ? 'Could not save this answer. Your copy remains on this device; retry before submitting.' : 'You are offline. This answer is stored on this device and will sync when you reconnect.');
      }
    } finally {
      if (responseVersionsRef.current.get(questionId) === version && pendingSavesRef.current.get(questionId) === saveTask) {
        pendingSavesRef.current.delete(questionId);
        setSavingIds((prev) => {
          const next = new Set(prev);
          next.delete(questionId);
          return next;
        });
      }
    }
  };

  const handleSubmitAssessment = async () => {
    if (pendingSavesRef.current.size > 0) {
      await Promise.allSettled([...pendingSavesRef.current.values()]);
    }
    if (!questions.every((question) => savedVersionsRef.current.get(question.id) === responseVersionsRef.current.get(question.id))) {
      toast.error('Wait for all answers to save successfully before submitting.');
      return;
    }
    try {
      const queued = await listQueuedResponses(currentUserId, attempt.id);
      if (queued.length || !navigator.onLine) {
        setOfflineQueueIds(new Set(queued.map((item) => item.questionId)));
        toast.error(queued.length ? 'Sync your saved answers before submitting.' : 'Reconnect to the internet before submitting.');
        return;
      }
    } catch {
      toast.error('Could not confirm that your answers are synced. Keep this page open and try again.');
      return;
    }
    const answeredCount = Object.keys(responses).length;
    if (answeredCount !== questions.length) {
      toast.error(`Answer all ${questions.length} questions before submitting.`);
      const unanswered = questions.find((question) => !responses[question.id]);
      if (unanswered) {
        setActiveDomain('ALL');
        window.setTimeout(() => document.getElementById(`q-${unanswered.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      }
      return;
    }
    try {
      setSubmitting(true);
      await desiredSkillsSaveRef.current.catch(() => undefined);
      if (desiredSkillsSavedValueRef.current !== desiredSkillsRef.current) {
        await saveDesiredSkills(desiredSkillsRef.current);
        await markAttemptDraftSynced({ userId: currentUserId, assessmentId: id, field: 'desiredSkills', value: desiredSkillsRef.current }).catch(() => setLocalBackupStatus('unavailable'));
        desiredSkillsSavedValueRef.current = desiredSkillsRef.current;
        setDesiredSkillsDirty(false);
        setDesiredSkillsSaved(Boolean(desiredSkillsRef.current));
      }
      const res = await api.post(`/attempts/${attempt.id}/submit`);
      if (res.data.success) {
        await Promise.allSettled([
          clearQueuedResponses(currentUserId, id),
          clearAttemptCheckpoint(currentUserId, id),
        ]);
        toast.success('Assessment submitted and evaluated successfully!');
        navigate(`/respondent/assessments/${attempt.id}/results`);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to submit assessment.');
    } finally {
      setSubmitting(false);
      setIsSubmitModalOpen(false);
    }
  };

  if (loading) return <LoadingSpinner text="Preparing Digital Literacy Assessment..." />;

  if (initializationMessage && !attempt) {
    return <div className="mx-auto max-w-2xl rounded-3xl border border-amber-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Assessment recovery</p>
      <h1 className="mt-2 text-2xl font-extrabold text-slate-900">Your saved answers stay on this device</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">{initializationMessage}</p>
      <p className="mt-3 text-sm leading-6 text-slate-600">When the assessment server is available, sign in with the same account on this same browser and device to continue syncing. Local backups cannot be opened from another device.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={() => { setInitializationMessage(''); setLoading(true); initAttempt(); }} className="min-h-11 rounded-xl bg-green-800 px-5 text-sm font-bold text-white hover:bg-green-900">Try again</button>
        <Link to="/respondent/assessments" className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700">Back to my assessments</Link>
      </div>
    </div>;
  }

  if (consentInfo) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6 pb-12">
        <div className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-950 to-green-900 p-6 text-white shadow-lg sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10"><ConsentShield aria-hidden="true" className="h-6 w-6" /></div>
            <div>
              <p className="max-w-2xl break-words text-xs font-bold uppercase tracking-[0.12em] text-emerald-200">Assessment of Digital Literacy Levels Among Computer Science Freshmen at Masbate Colleges</p>
              <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Before you begin</h1>
            </div>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-emerald-50">
            This study assesses your profile and self-assessed digital literacy skills in information and data literacy, communication and collaboration, digital content creation, safety, and problem solving. The questionnaire takes approximately 20 minutes and includes an open-ended question about the digital skills you most want to develop in college.
          </p>
        </div>

        {guardianPending && (
          <div role="status" className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
            <h2 className="font-bold">Waiting for parent/guardian confirmation</h2>
            <p className="mt-1 text-sm leading-6">A one-time link was sent to {consentForm.guardianEmail || 'the parent or guardian email'}. The assessment will unlock after they open the link and confirm. This page checks for confirmation automatically.</p>
          </div>
        )}

          <form onSubmit={handleConsentSubmit} className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            {consentInfo.studyInfo?.consentText ? (
              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <h2 className="text-base font-bold text-slate-900">Approved study information</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{consentInfo.studyInfo.consentText}</p>
              </section>
            ) : (
              <>
                <section>
                  <h2 className="text-base font-bold text-slate-900">Purpose and participation</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">Taking part is voluntary. You may decline or stop at any time without penalty or effect on your grades or standing at the College. There are no expected risks beyond the ordinary inconvenience of answering a survey.</p>
                </section>
                <section>
                  <h2 className="text-base font-bold text-slate-900">Confidentiality</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">Your responses are for academic purposes. Because this assessment uses a signed-in account, saved answers are linked to your account while stored. Study summary reports use respondent codes instead of names, and access to stored data is limited to authorized study personnel. A temporary recovery copy is also kept in this browser on the device used to answer; it is cleared after confirmed submission or withdrawal, but clearing browser data may erase an unsynced copy sooner. Use the same device and browser to recover work, and avoid shared devices. You may stop at any time. Withdrawal removes your saved study answers and scores from the active system, and removes your shared study profile when no other consented assessment uses it. Encrypted backup copies may remain until their scheduled expiry.</p>
                </section>
              </>
            )}
            {consentInfo.studyInfo?.researcherName && (
              <section className="rounded-xl bg-green-50 p-4 text-sm leading-6 text-green-950">
                <p><span className="font-semibold">Researcher:</span> {consentInfo.studyInfo.researcherName} · <a className="font-semibold underline" href={`mailto:${consentInfo.studyInfo.researcherEmail}`}>{consentInfo.studyInfo.researcherEmail}</a></p>
                {consentInfo.studyInfo.approvalId && <p><span className="font-semibold">Approval reference:</span> {consentInfo.studyInfo.approvalId}</p>}
                {consentInfo.studyInfo.retentionPolicy && <p><span className="font-semibold">Data retention:</span> {consentInfo.studyInfo.retentionPolicy}</p>}
              </section>
            )}

            <div>
              <label htmlFor="participant-consent-age" className="block text-sm font-semibold text-slate-800">Age</label>
              <input
                id="participant-consent-age"
                type="number"
                min="1"
                max="150"
                value={consentForm.participantAge}
                onChange={(event) => setConsentForm({ ...consentForm, participantAge: event.target.value })}
                required
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-600/20"
              />
              <p className="mt-1 text-xs leading-5 text-slate-500">We ask your age first only to determine whether parent or guardian consent is required. The rest of your study profile comes after you consent.</p>
            </div>

            <div>
              <label htmlFor="participant-consent-name" className="block text-sm font-semibold text-slate-800">{consentIsMinor ? 'Student’s name' : 'Respondent’s name'}</label>
              <input
                id="participant-consent-name"
                value={consentForm.participantName}
                onChange={(event) => setConsentForm({ ...consentForm, participantName: event.target.value })}
                required
                maxLength={160}
                autoComplete="name"
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-600/20"
              />
            </div>
            {consentIsMinor && <h2 className="text-base font-bold text-slate-900">Student assent</h2>}
            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              <input type="checkbox" required checked={consentForm.participantConfirmed} onChange={(event) => setConsentForm({ ...consentForm, participantConfirmed: event.target.checked })} className="mt-1 h-4 w-4 accent-green-700" />
              <span>{consentIsMinor ? (consentInfo.studyInfo?.assentText || 'I understand the purpose of the study and agree to participate voluntarily. I understand that I may stop participating at any time.') : 'I have read and understood the information above. I voluntarily agree to participate in this study.'}</span>
            </label>

            {consentIsMinor && (
              <section className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                <div>
                  <h2 className="font-bold text-amber-950">Parent or guardian consent</h2>
                  <p className="mt-1 text-sm leading-5 text-amber-900">Because you are under 18, a parent or guardian must confirm consent from their own email inbox before the assessment can start.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="guardian-consent-name" className="block text-sm font-semibold text-slate-800">Parent/guardian full name</label>
                    <input id="guardian-consent-name" value={consentForm.guardianName} onChange={(event) => setConsentForm({ ...consentForm, guardianName: event.target.value })} required maxLength={160} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-600/20" />
                  </div>
                  <div>
                    <label htmlFor="guardian-consent-relationship" className="block text-sm font-semibold text-slate-800">Relationship to student</label>
                    <input id="guardian-consent-relationship" value={consentForm.guardianRelationship} onChange={(event) => setConsentForm({ ...consentForm, guardianRelationship: event.target.value })} required maxLength={80} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-600/20" />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="guardian-consent-email" className="block text-sm font-semibold text-slate-800">Parent/guardian email</label>
                    <input id="guardian-consent-email" type="email" autoComplete="email" value={consentForm.guardianEmail} onChange={(event) => setConsentForm({ ...consentForm, guardianEmail: event.target.value })} required maxLength={200} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-600/20" />
                  </div>
                </div>
                {consentInfo.studyInfo?.guardianConsentText && <p className="rounded-xl border border-amber-200 bg-white p-4 text-sm leading-6 text-slate-700">{consentInfo.studyInfo.guardianConsentText}</p>}
                <p className="text-sm text-amber-900">We will email a one-time confirmation link to this address. The student cannot begin until the parent or guardian opens it.</p>
              </section>
            )}

            <div className="flex flex-col-reverse justify-end gap-3 border-t border-slate-100 pt-5 sm:flex-row">
              <Link to="/respondent/assessments" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">I do not consent</Link>
              <button type="submit" disabled={consentSubmitting} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-green-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-green-900 disabled:opacity-60">{consentSubmitting ? 'Sending…' : guardianPending ? 'Resend guardian link' : 'Agree and continue'}</button>
            </div>
          </form>
      </div>
    );
  }

  const answeredCount = Object.keys(responses).length;
  const totalCount = questions.length;
  const progressPercent = totalCount > 0 ? (answeredCount / totalCount) * 100 : 0;

  const domainIcons = {
    IDL: Database,
    CC: MessageSquare,
    DCC: FileCode,
    S: ShieldCheck,
    PS: Wrench,
  };

  const filteredQuestions =
    activeDomain === 'ALL'
      ? questions
      : questions.filter((q) => q.area_code === activeDomain);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Top Fixed Progress & Info Card */}
      <div className="sticky top-16 z-20 bg-white/95 backdrop-blur-md rounded-3xl border border-slate-200/80 p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-green-600">
              DigComp 2.1 Self-Assessment Questionnaire
            </span>
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900">
              {assessment?.title || 'Digital Literacy Assessment'}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <span className="shrink-0 text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
              Answered: <span className="text-green-600 font-extrabold">{answeredCount}</span> / {totalCount}
            </span>
            {remainingSeconds !== null && (
              <span className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-xl border ${remainingSeconds === 0 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`} role="timer">
                <Clock className="inline w-3.5 h-3.5 mr-1" />
                {remainingSeconds === 0 ? 'Time is up' : formatTime(remainingSeconds)}
              </span>
            )}

            <button
              onClick={() => setIsSubmitModalOpen(true)}
              className="inline-flex shrink-0 items-center px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-xs shadow-md shadow-green-500/20 cursor-pointer transition-all"
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              <span>Review & Submit</span>
            </button>
          </div>
        </div>

        <ProgressBar progress={progressPercent} color="brand" height="h-2" />

        {/* Domain Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 text-[11px] font-bold">
          <button
            onClick={() => setActiveDomain('ALL')}
            aria-pressed={activeDomain === 'ALL'}
            className={`px-3 py-1.5 rounded-lg shrink-0 cursor-pointer transition-colors ${
              activeDomain === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Questions ({questions.length})
          </button>

          {competenceAreas.map((area) => {
            const Icon = domainIcons[area.code] || HelpCircle;
            const isSelected = activeDomain === area.code;
            const domainQuestions = questions.filter((q) => q.area_code === area.code);
            const domainAnswered = domainQuestions.filter((q) => responses[q.id]).length;

            return (
              <button
                key={area.code}
                onClick={() => setActiveDomain(area.code)}
                aria-pressed={isSelected}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg shrink-0 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-green-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{area.name}</span>
                <span className={`text-[10px] px-1 py-0.2 rounded-md ${isSelected ? 'bg-green-700 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {domainAnswered}/{domainQuestions.length}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div role="status" aria-live="polite" className={`flex flex-col gap-1 rounded-2xl border px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between ${localBackupStatus === 'unavailable' ? 'border-rose-200 bg-rose-50 text-rose-900' : localBackupStatus === 'best-effort' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
        <p className="font-bold">{localBackupStatus === 'protected' ? 'On-device recovery copy is active' : localBackupStatus === 'restored' ? 'Assessment restored from this device' : localBackupStatus === 'best-effort' ? 'On-device recovery copy is active; browser storage may be cleared' : localBackupStatus === 'unavailable' ? 'On-device recovery copy is unavailable' : 'Preparing an on-device recovery copy…'}</p>
        <p>{localBackupStatus === 'unavailable' ? 'Make sure each answer shows “Saved to system” before closing.' : 'Use the same device and browser to recover this assessment.'}</p>
      </div>
      {assessment?.time_limit_minutes && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">This assessment is timed. The timer continues while the device is off; saved answers remain available, but the time limit may expire. Contact your instructor if you need the timed attempt reopened.</p>}

      {(!isOnline || syncConnectionError || offlineQueueIds.size > 0 || isOfflineRecovery) && <div role="status" aria-live="polite" className={`flex flex-col gap-3 rounded-2xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${isOnline ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-sky-200 bg-sky-50 text-sky-900'}`}>
        <div><p className="font-bold">{syncBlockedReason ? 'Answers need instructor attention' : !isOnline ? 'Connection interrupted' : syncConnectionError ? 'Cannot reach or sync with the assessment server' : isOfflineRecovery ? 'Recovered work is waiting to sync' : 'Some answers are waiting to sync'}</p><p className="mt-0.5 text-xs leading-5">{syncBlockedReason || `${offlineQueueIds.size ? `${offlineQueueIds.size} answer${offlineQueueIds.size === 1 ? '' : 's'} saved on this device.` : 'Your current work is backed up on this device.'} Keep using this same browser and device. Reconnect and sign in to sync; submission is available after the system confirms every answer.`}</p></div>
        {isOnline && <button type="button" onClick={() => setSyncRequest((current) => current + 1)} disabled={syncingQueue} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-current/20 bg-white px-3 text-xs font-bold disabled:opacity-50">{syncingQueue ? 'Syncing…' : 'Sync answers now'}</button>}
      </div>}

      {/* Instructions Box */}
      <div className="bg-green-50/80 border border-green-200/80 rounded-2xl p-4 text-xs text-green-900 flex items-start space-x-3">
        <Info className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">Part II Instructions:</p>
          <p className="text-green-800 leading-relaxed">
            Read each statement carefully and select the rating that most accurately reflects your personal competence:
            <br />
            <strong>4</strong> = I can do this confidently and independently | <strong>3</strong> = I can do this with occasional difficulty | <strong>2</strong> = I can do this with much difficulty | <strong>1</strong> = I cannot do this.
          </p>
        </div>
      </div>

      {/* Questions Stack */}
      <div className="space-y-5">
        {filteredQuestions.map((q) => {
          const selectedRating = responses[q.id];
          const isAnswered = !!selectedRating;
          const Icon = domainIcons[q.area_code] || HelpCircle;

          return (
            <div
              key={q.id}
              id={`q-${q.id}`}
              className={`bg-white rounded-3xl border transition-all p-6 sm:p-7 shadow-xs ${
                isAnswered
                  ? 'border-green-200/80 ring-1 ring-green-50'
                  : 'border-slate-200/80 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start space-x-3.5">
                  <div
                    className={`w-9 h-9 rounded-2xl font-extrabold flex items-center justify-center text-xs shrink-0 mt-0.5 ${
                      isAnswered
                        ? 'bg-green-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}
                  >
                    #{q.question_number}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-[10px] font-bold text-green-600 uppercase tracking-wider flex items-center">
                        <Icon className="w-3 h-3 mr-1" />
                        {q.area_name}
                      </span>
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                      {q.question_text}
                    </h3>
                  </div>
                </div>

                {(savingIds.has(q.id) || savedIds.has(q.id) || offlineQueueIds.has(q.id)) && (
                  <span className={`inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold ${savingIds.has(q.id) ? 'text-green-600' : 'text-emerald-700'}`}>
                    {savingIds.has(q.id) && !offlineQueueIds.has(q.id) ? 'Saving…' : offlineQueueIds.has(q.id) ? <><CheckCircle2 aria-hidden="true" className="h-3 w-3" /> Saved on device · syncing</> : <><CheckCircle2 aria-hidden="true" className="h-3 w-3" /> Saved to system</>}
                  </span>
                )}
              </div>

              {/* 4-Point Likert Rating Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mt-5">
                {ratingScale.map((opt) => {
                  const isSelected = selectedRating === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleRatingSelect(q.id, opt.value)}
                      disabled={remainingSeconds === 0 || savingIds.has(q.id)}
                      aria-pressed={isSelected}
                      aria-label={`Question ${q.question_number}, rating ${opt.value}: ${opt.label}`}
                      className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'border-green-600 bg-green-50/80 shadow-xs ring-2 ring-green-500/20'
                          : 'border-slate-200/90 bg-slate-50/60 hover:bg-slate-100/80 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className={`w-6 h-6 rounded-xl flex items-center justify-center text-xs font-black ${
                            isSelected
                              ? 'bg-green-600 text-white'
                              : 'bg-white border border-slate-300 text-slate-700'
                          }`}
                        >
                          {opt.value}
                        </span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                      </div>
                      <p
                        className={`text-xs leading-relaxed ${
                          isSelected ? 'font-bold text-green-900' : 'text-slate-600 font-medium'
                        }`}
                      >
                        {opt.label}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {activeDomain === 'ALL' && (
          <section className="rounded-3xl border border-sky-200 bg-white p-6 shadow-xs sm:p-7" aria-labelledby="desired-skills-title">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700"><Info aria-hidden="true" className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">Part III · Open-ended question</p>
                <h2 id="desired-skills-title" className="mt-1 text-base font-bold leading-snug text-slate-900">Which digital skills would you most like to develop in college?</h2>
                <p className="mt-1 text-sm leading-5 text-slate-600">Your answer is optional and is not included in your digital literacy score.</p>
              </div>
              <span className="shrink-0 text-xs font-medium text-slate-500" role="status">{desiredSkillsSaving ? 'Syncing…' : desiredSkillsSaved && !desiredSkillsDirty ? 'Saved to system' : desiredSkillsDirty && desiredSkillsLocalSaved ? 'Saved on this device' : desiredSkillsDirty ? 'Saving on this device…' : ''}</span>
            </div>
            <label htmlFor="desired-skills" className="sr-only">Digital skills you would like to develop</label>
            <textarea
              id="desired-skills"
              rows={4}
              maxLength={1200}
              value={desiredSkills}
              onChange={(event) => {
                const value = event.target.value;
                desiredSkillsRef.current = value;
                setDesiredSkills(value);
                setDesiredSkillsDirty(true);
                setDesiredSkillsSaved(false);
                setDesiredSkillsLocalSaved(false);
                saveAttemptDraftField({ userId: currentUserId, assessmentId: id, field: 'desiredSkills', value })
                  .then((saved) => {
                    if (saved && desiredSkillsRef.current === value) setDesiredSkillsLocalSaved(true);
                    else if (!saved) setLocalBackupStatus('unavailable');
                  })
                  .catch(() => setLocalBackupStatus('unavailable'));
              }}
              disabled={remainingSeconds === 0}
              placeholder="For example, evaluating online sources, creating presentations, or troubleshooting common computer problems…"
              className="mt-5 min-h-28 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900 placeholder:text-slate-400 focus:border-green-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-600/20 disabled:opacity-60"
            />
            <p className="mt-2 flex flex-col justify-between gap-1 text-xs text-slate-500 sm:flex-row"><span>Please do not include names or other details that could identify you or another person.</span><span className="text-right">{desiredSkills.length}/1,200 characters</span></p>
          </section>
        )}
      </div>

      {/* Floating Bottom Navigator Bar */}
      <div className="fixed bottom-4 left-0 right-0 z-30 px-4">
        <div className="max-w-3xl mx-auto bg-slate-900/95 backdrop-blur-md rounded-2xl p-3 px-5 text-white shadow-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-slate-400">{remainingSeconds === 0 ? 'Time expired:' : 'Completion:'}</span>
            <span className="text-xs font-extrabold text-green-400">
              {answeredCount} / {totalCount} ({Math.round(progressPercent)}%)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setIsWithdrawModalOpen(true)} className="rounded-xl px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-white/10 hover:text-white">Stop and withdraw</button>
            <button
              onClick={() => setIsSubmitModalOpen(true)}
              className="inline-flex items-center px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-xs font-bold shadow-md cursor-pointer transition-colors"
            >
              <span>Proceed to Submit</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Submission Confirmation Modal */}
      <Modal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        title="Confirm Assessment Submission"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-green-50 border border-green-200 text-center">
            <div className="w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center mx-auto mb-2 font-bold shadow-sm">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900">
              {answeredCount === totalCount
                ? `All ${totalCount} Questions Answered!`
                : `${answeredCount} of ${totalCount} Questions Answered`}
            </h4>
            <p className="text-xs text-slate-600 mt-1">
              {remainingSeconds === 0 && answeredCount !== totalCount
                ? 'Time is up before every question was answered. Your saved responses are retained; contact your instructor to request a timed restart.'
                : remainingSeconds === 0
                ? 'The time limit has ended. All responses are saved and ready to submit.'
                : answeredCount === totalCount
                ? 'Your responses are saved. Click below to compute your digital literacy scores and proficiency levels.'
                : 'Complete every question before submitting. This keeps your result based on the full assigned questionnaire.'}
            </p>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-3">
            <button
              type="button"
              onClick={() => setIsSubmitModalOpen(false)}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 cursor-pointer"
            >
              Continue Answering
            </button>
            <button
              type="button"
              onClick={handleSubmitAssessment}
              disabled={submitting || answeredCount !== totalCount || savingIds.size > 0 || desiredSkillsSaving || offlineQueueIds.size > 0 || !isOnline}
              className="px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-bold shadow-md cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Calculating Results...' : 'Finalize & Submit'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isWithdrawModalOpen} onClose={() => setIsWithdrawModalOpen(false)} title="Withdraw from this study" maxWidth="max-w-md">
        <div className="space-y-4">
          <p className="text-sm leading-6 text-slate-600">You may stop participating without penalty. Confirming withdrawal permanently deletes your saved answers and score for this assessment. You may choose to participate again later by signing consent again.</p>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setIsWithdrawModalOpen(false)} className="min-h-11 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Keep answering</button>
            <button type="button" onClick={handleWithdraw} disabled={withdrawing} className="min-h-11 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-800 disabled:opacity-60">{withdrawing ? 'Withdrawing…' : 'Withdraw and delete answers'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default TakeAssessment;

