import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, Download, WifiOff } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { useAuth } from '../../contexts/useAuth';
import { useDemoMode } from '../../contexts/useDemoMode';
import { clearQuizRecovery, downloadQuizRecovery, readQuizRecovery, writeQuizRecovery } from '../../utils/quizRecovery';
import { Empty, Field, KnowledgePage, LevelBadge } from './KnowledgeCommon';
import { displayDate, knowledgeDownload } from './knowledgeClient';

const expandedQuestionMapQuery = '(min-width: 1024px), (min-width: 768px) and (min-height: 500px)';

export default function KnowledgeAttemptRoute() {
  const { attemptId } = useParams();
  return <KnowledgeAttempt key={attemptId} attemptId={Number(attemptId)} />;
}

function KnowledgeAttempt({ attemptId }) {
  const { user } = useAuth();
  const { freeDemoReadOnly } = useDemoMode();
  const [data, setData] = useState(null), [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [index, setIndex] = useState(0), [review, setReview] = useState(false);
  const [questionMapOpen, setQuestionMapOpen] = useState(() => window.matchMedia(expandedQuestionMapQuery).matches);
  const [syncStatus, setSyncStatus] = useState('Loading saved answers…');
  const [storageError, setStorageError] = useState('');
  const [pending, setPending] = useState(false), [clockOffset, setClockOffset] = useState(0);
  const [conflict, setConflict] = useState(false);
  const [online, setOnline] = useState(navigator.onLine), [now, setNow] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false), [retainedDraft, setRetainedDraft] = useState(null);
  const latest = useRef(null), writes = useRef(Promise.resolve()), upload = useRef(null), active = useRef(true);
  const automaticSubmit = useRef(false), questionHeading = useRef(null), moveFocus = useRef(false);
  const canAnswer = user.role === 'respondent';
  useEffect(() => {
    const media = window.matchMedia(expandedQuestionMapQuery);
    const update = () => setQuestionMapOpen(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const persist = useCallback((record) => {
    writes.current = writes.current.catch(() => {}).then(() => writeQuizRecovery(user.id, attemptId, record)).then(() => true).catch((failure) => {
      if (active.current) setStorageError(failure.message);
      return false;
    });
    return writes.current;
  }, [user.id, attemptId]);

  const sync = useCallback(() => {
    if (upload.current) return upload.current;
    if (!navigator.onLine || !latest.current || !canAnswer) return Promise.resolve(false);
    const operation = async () => {
      while (active.current && latest.current?.pending && navigator.onLine) {
        await writes.current;
        const record = latest.current;
        if (record.data.attempt.status === 'completed') return false;
        try {
          if (active.current) setSyncStatus('Saving answers to the server…');
          if (record.conflict) return false;
          const saved = await api.put(`/knowledge/attempts/${attemptId}/answers`, { expected_revision: record.baseRevision,
            responses: Object.entries(record.answers).map(([question_id, answer]) => ({ question_id: Number(question_id), answer })) });
          latest.current = { ...latest.current, baseRevision: saved.data.data.answers_revision };
          if (latest.current.revision === record.revision) {
            latest.current = { ...latest.current, pending: false };
            if (active.current) setPending(false);
            const acknowledgedRevision = record.revision;
            writes.current = writes.current.catch(() => {}).then(() => {
              const current = latest.current;
              if (current.revision === acknowledgedRevision && !current.pending) return writeQuizRecovery(user.id, attemptId, current);
              return undefined;
            }).catch((failure) => { if (active.current) setStorageError(failure.message); });
            await writes.current;
            if (active.current) setSyncStatus('All answers saved to the server');
          }
        } catch (failure) {
          if (failure.response?.status === 409) { latest.current = { ...latest.current, conflict: true }; if (active.current) setConflict(true); }
          if (active.current) setSyncStatus(failure.response?.status === 410 ? 'Time has ended. Only answers received before the deadline can be scored.' : 'Upload pending. Keep this browser’s recovery copy and reconnect to sync.');
          return false;
        }
      }
      return !latest.current?.pending;
    };
    upload.current = operation().finally(() => { upload.current = null; });
    return upload.current;
  }, [attemptId, canAnswer, user.id]);

  useEffect(() => {
    active.current = true;
    let cancelled = false;
    const load = async () => {
      let backup;
      if (canAnswer) {
        try { backup = await readQuizRecovery(user.id, attemptId); }
        catch (failure) { if (!cancelled) setStorageError(failure.message); }
      }
      try {
        const response = await api.get(`/knowledge/attempts/${attemptId}`);
        if (cancelled) return;
        const loaded = response.data.data;
        const serverAnswers = Object.fromEntries(loaded.responses.map((answer) => [answer.question_id, answer.answer]));
        if (loaded.attempt.status === 'completed') {
          if (backup?.pending) setRetainedDraft(backup);
          else if (canAnswer) await clearQuizRecovery(user.id, attemptId).catch(() => {});
          setData(loaded); setAnswers(serverAnswers); return;
        }
        const acknowledged = backup?.pending && Object.entries(backup.answers).every(([questionId, answer]) => (serverAnswers[questionId] ?? '') === answer);
        const hasPending = Boolean(backup?.pending && !acknowledged);
        const diverged = hasPending && (backup.baseRevision ?? -1) !== loaded.attempt.answers_revision;
        const recovered = hasPending ? { ...serverAnswers, ...backup.answers } : serverAnswers;
        const record = { data: loaded, answers: recovered, pending: hasPending, conflict: diverged,
          baseRevision: loaded.attempt.answers_revision, revision: Number(backup?.revision || 0), clockOffset: loaded.server_now ? Date.parse(loaded.server_now) - Date.now() : 0 };
        latest.current = record; setData(loaded); setAnswers(recovered); setPending(record.pending); setClockOffset(record.clockOffset); setConflict(diverged);
        setSyncStatus(record.pending ? 'Recovered answers waiting to sync' : 'All answers saved to the server');
        if (canAnswer) { await persist(record); if (!cancelled) void sync(); }
      } catch (failure) {
        if (cancelled) return;
        // Authorization failures never reveal a cached assessment.
        if (backup && !failure.response && canAnswer && backup.userId === user.id && backup.attemptId === attemptId) {
          latest.current = backup; setData(backup.data); setAnswers(backup.answers); setPending(backup.pending); setClockOffset(backup.clockOffset || 0); setConflict(Boolean(backup.conflict)); setSyncStatus('Recovered on this device. Reconnect to synchronize before submitting.');
        } else setError(failure.response?.data?.message || 'Could not load this assessment. Reconnect and try again.');
      } finally { if (!cancelled) setLoading(false); }
    };
    void load();
    const connected = () => { automaticSubmit.current = false; setOnline(true); void sync(); };
    const disconnected = () => { setOnline(false); setSyncStatus('Offline. New responses remain on this device until uploaded.'); };
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const visible = () => { setNow(Date.now()); if (navigator.onLine) void sync(); };
    const beforeUnload = (event) => { if (latest.current?.pending) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('online', connected); window.addEventListener('offline', disconnected);
    window.addEventListener('beforeunload', beforeUnload); document.addEventListener('visibilitychange', visible);
    return () => { cancelled = true; active.current = false; window.clearInterval(timer); window.removeEventListener('online', connected); window.removeEventListener('offline', disconnected); window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('visibilitychange', visible); };
  }, [attemptId, user.id, canAnswer, persist, sync]);

  useEffect(() => {
    if (moveFocus.current) {
      questionHeading.current?.focus({ preventScroll: true });
      questionHeading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
      moveFocus.current = false;
    }
  }, [index, review, questionMapOpen]);

  const remaining = data?.attempt.deadline ? Math.max(0, Math.ceil((Date.parse(data.attempt.deadline) - now - clockOffset) / 1000)) : null;
  const expired = remaining === 0;
  const submit = useCallback(async (timedOut = false) => {
    if (!latest.current || !navigator.onLine || submitting || freeDemoReadOnly) return;
    if (!timedOut && !window.confirm('Submit your answers for scoring? Submitted answers cannot be changed.')) return;
    setSubmitting(true);
    try {
      await writes.current;
      const synchronized = await sync();
      if (!synchronized && !timedOut && latest.current.pending) throw new Error('Wait for your answers to synchronize before submitting.');
      const response = await api.post(`/knowledge/attempts/${attemptId}/submit`);
      const completed = response.data.data;
      if (latest.current.pending) setRetainedDraft({ ...latest.current, userId: user.id, attemptId });
      else await clearQuizRecovery(user.id, attemptId).catch(() => {});
      latest.current = { ...latest.current, data: completed };
      if (active.current) { setData(completed); toast.success('Assessment scored. Your result is ready.'); }
    } catch (failure) { if (active.current) toast.error(failure.response?.data?.message || failure.message || 'Could not submit. Your saved answers remain available.'); }
    finally { if (active.current) setSubmitting(false); }
  }, [attemptId, freeDemoReadOnly, submitting, sync, user.id]);

  useEffect(() => {
    if (expired && online && canAnswer && data?.attempt.status === 'in_progress' && !automaticSubmit.current) {
      automaticSubmit.current = true;
      void submit(true);
    }
  }, [expired, online, canAnswer, data?.attempt.status, submit]);

  const answer = (value) => {
    if (!latest.current || expired || submitting) return;
    const next = { ...latest.current.answers, [data.snapshot.questions[index].id]: value };
    const record = { ...latest.current, answers: next, revision: latest.current.revision + 1, pending: true };
    latest.current = record; setAnswers(next); setPending(true); setSyncStatus('Saving a recovery copy on this device…');
    void persist(record).then((saved) => {
      if (!active.current) return;
      if (!navigator.onLine) setSyncStatus(saved ? 'Saved on this device. Reconnect to upload your answers.' : 'Not saved yet. Keep this tab open and reconnect to save your answers.');
      void sync();
    });
  };
  const selectQuestion = (value) => { moveFocus.current = true; setIndex(value); setReview(false); if (!window.matchMedia(expandedQuestionMapQuery).matches) setQuestionMapOpen(false); };
  const resolveConflict = async (keepLocal) => {
    if (!navigator.onLine) return;
    if (!window.confirm(keepLocal ? 'Replace the current server answers with this device’s responses?' : 'Replace this device’s pending answers with the server copy? Download the local copy first if you need to keep it.')) return;
    try {
      const response = await api.get(`/knowledge/attempts/${attemptId}`);
      const current = response.data.data;
      if (current.attempt.status === 'completed') { setRetainedDraft({ ...latest.current, userId: user.id, attemptId }); setData(current); return; }
      const resolved = { ...latest.current, data: current, conflict: false, baseRevision: current.attempt.answers_revision,
        answers: keepLocal ? latest.current.answers : Object.fromEntries(current.responses.map((item) => [item.question_id, item.answer])), pending: keepLocal, revision: latest.current.revision + 1 };
      latest.current = resolved; setAnswers(resolved.answers); setPending(resolved.pending); setConflict(false);
      await persist(resolved); if (keepLocal) void sync(); else setSyncStatus('Server answers restored on this device');
    } catch { toast.error('Could not compare the saved answers. Reconnect and try again.'); }
  };
  const back = user.role === 'admin' ? '/admin/results' : user.role === 'assessor' ? '/assessor/results' : '/respondent/knowledge';
  if (loading || error || !data) return <KnowledgePage title="Knowledge assessment" loading={loading} error={error} reload={() => window.location.reload()} />;
  const questions = data.snapshot.questions;
  const answered = questions.filter((question) => String(answers[question.id] ?? '').trim()).length;
  const question = questions[index];

  return <KnowledgePage className={canAnswer ? 'student-quiz-page' : ''} title={data.snapshot.title} description={data.attempt.status === 'completed' ? `Completed ${displayDate(data.attempt.completed_at)} · Knowledge assessment` : 'Answer independently. You can review before submitting.'} action={<Link className="kq-button kq-button-secondary" to={back} aria-label={canAnswer ? 'Back to assessments' : 'Back to results'}><ArrowLeft size={16} aria-hidden="true" /><span className="kq-back-label">Back</span></Link>}>
    {data.results ? <>
      <section className="kq-hero"><div><p className="kq-eyebrow">Assessment complete</p><h2>{data.attempt.first_name ? `${data.attempt.first_name} ${data.attempt.last_name}` : `${user.first_name} ${user.last_name}`}</h2><p>{data.results.earned} of {data.results.possible} points · <LevelBadge level={data.results.level} /></p></div><div className="kq-score">{data.results.percentage}%</div></section>
      <div className="kq-actions"><button className="kq-button kq-button-secondary" onClick={() => knowledgeDownload(`/knowledge/attempts/${attemptId}/export/pdf`, `Knowledge_Result_${attemptId}.pdf`)}><Download size={16} aria-hidden="true" />PDF report</button><button className="kq-button kq-button-secondary" onClick={() => knowledgeDownload(`/knowledge/attempts/${attemptId}/export/excel`, `Knowledge_Result_${attemptId}.xlsx`)}>Excel report</button>
        {data.attempt.certificate_earned === 1 && !freeDemoReadOnly && <button className="kq-button" onClick={() => knowledgeDownload(`/knowledge/attempts/${attemptId}/export/certificate`, `Achievement_${attemptId}.pdf`)}>Download achievement certificate</button>}
      </div><p className="kq-note">Achievement certificates require {data.snapshot.pass_percentage}%. {data.attempt.certificate_earned ? 'The requirement was met.' : 'The requirement was not met on this attempt.'} Percentage levels apply to knowledge quizzes only.</p>
      {retainedDraft && <section className="kq-card"><h2>Unsynced recovery copy retained</h2><p className="kq-note">Some local responses did not reach the server before completion or the deadline. They are not included in this score. You can keep a copy for follow-up with your instructor.</p><div className="kq-actions"><button className="kq-button kq-button-secondary" onClick={() => downloadQuizRecovery(retainedDraft)}>Download local recovery copy</button><button className="kq-button kq-button-danger" onClick={async () => { if (window.confirm('Discard the unsynced local copy? This cannot be undone.')) { await clearQuizRecovery(user.id, attemptId); setRetainedDraft(null); } }}>Discard local copy</button></div></section>}
      <section className="kq-card"><h2>Strengths and areas to develop</h2><div className="kq-bars" style={{ marginTop: 20 }}>{data.results.categories.map((category) => <div key={category.id}><div><span>{category.name}</span><strong>{category.percentage}%</strong></div><meter min={0} max={100} value={category.percentage} aria-label={`${category.name}: ${category.percentage}%`} />{canAnswer && category.percentage < 70 && <Link className="kq-note" to={`/respondent/materials?category=${category.id}`}>Explore learning materials for this area →</Link>}</div>)}</div></section>
      <section className="kq-list"><h2>Answer review</h2>{data.results.questions.map((item, number) => <article className="kq-card kq-review-item" data-correct={item.correct} key={item.id}><div className="kq-section-title"><span className={`kq-badge ${item.correct ? 'kq-badge-success' : 'kq-badge-warning'}`}>{item.correct ? 'Correct' : 'Incorrect'} · {item.earned}/{item.points} points</span><span className="kq-note">{item.category_name}</span></div><h3>{number + 1}. {item.prompt}</h3><p className="kq-note">Your answer: <strong>{item.options.find((option) => option.id === item.answer)?.text || item.answer || 'Unanswered'}</strong></p><p className="kq-note">Accepted answer: {item.answers.map((key) => item.options.find((option) => option.id === key)?.text || key).join(' / ')}</p>{item.explanation && <p className="kq-note">{item.explanation}</p>}</article>)}</section>
    </> : <div className="kq-page kq-take">
      {conflict && <section className="kq-card" role="alert"><h2>Answers changed in another tab or device</h2><p className="kq-note">Your local recovery copy is preserved. Choose which copy to keep before synchronization can continue.</p><div className="kq-actions"><button className="kq-button kq-button-secondary" onClick={() => downloadQuizRecovery({ ...latest.current, userId: user.id, attemptId })}>Download local copy</button><button className="kq-button" disabled={!online} onClick={() => resolveConflict(true)}>Keep this device’s answers</button><button className="kq-button kq-button-secondary" disabled={!online} onClick={() => resolveConflict(false)}>Use server answers</button></div></section>}
      {!online && <p role="status" className="kq-check"><WifiOff size={18} aria-hidden="true" />You are offline. Keep using this device and browser; reconnect before submission.</p>}
      <section className="kq-card kq-attempt-status"><div className="kq-section-title"><div><p className="kq-eyebrow">Assessment progress</p><strong>{answered} of {questions.length} answered</strong></div><span className="kq-timer" aria-label="Time remaining">{remaining === null ? 'Untimed' : `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`}</span></div><div className="kq-progress" role="progressbar" aria-label="Assessment progress" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={answered}><div style={{ width: `${answered / questions.length * 100}%` }} /></div><p className="kq-note" role="status">{syncStatus}</p>{storageError && <p className="kq-note" role="alert">Local recovery is unavailable: {storageError} Keep this tab open and maintain a connection so responses can be saved to the server.</p>}</section>
      <div className="kq-question-map"><button type="button" className="kq-question-map-toggle" aria-expanded={questionMapOpen} aria-controls="quiz-question-map" onClick={() => setQuestionMapOpen(value => !value)}><span>{review ? 'Question list' : `Question ${index + 1} of ${questions.length}`}</span><span>{questionMapOpen ? 'Hide list' : 'Show list'}<ChevronDown size={16} aria-hidden="true" /></span></button>
      <nav id="quiz-question-map" hidden={!questionMapOpen} className="kq-question-navigation" aria-label="Assessment questions">{questions.map((item, number) => <button key={item.id} type="button" data-answered={Boolean(String(answers[item.id] ?? '').trim())} aria-current={!review && index === number ? 'step' : undefined} aria-label={`Question ${number + 1}${String(answers[item.id] ?? '').trim() ? ', answered' : ', unanswered'}`} onClick={() => selectQuestion(number)}>{number + 1}</button>)}</nav></div>
      {review ? <section className="kq-card"><h2 ref={questionHeading} tabIndex={-1}>Review your answers</h2><p className="kq-note">{questions.length - answered} unanswered. You can return to any question before submitting.</p><div className="kq-list" style={{ marginTop: 18 }}>{questions.map((item, number) => <button className="kq-question-row" key={item.id} onClick={() => selectQuestion(number)}><span><strong>{number + 1}. {item.prompt}</strong><p>{item.options.find((option) => option.id === answers[item.id])?.text || answers[item.id] || 'Unanswered'}</p></span><ArrowRight size={17} aria-hidden="true" /></button>)}</div><div className="kq-actions" style={{ marginTop: 20 }}><button className="kq-button" disabled={!online || submitting || (answered !== questions.length && !expired) || freeDemoReadOnly} onClick={() => submit(expired)}>{submitting ? 'Submitting…' : 'Submit assessment'}</button><button className="kq-button kq-button-secondary" onClick={() => selectQuestion(index)}>Continue answering</button></div></section>
        : <section className="kq-card kq-question-card"><div className="kq-section-title"><span className="kq-badge">{question.category_name}</span><span className="kq-note">{question.points} point{question.points === 1 ? '' : 's'} · {question.type.replaceAll('_', ' ')}</span></div><h2 ref={questionHeading} tabIndex={-1}>{index + 1}. {question.prompt}</h2><fieldset disabled={expired || submitting || !canAnswer || freeDemoReadOnly} className="kq-options"><legend className="sr-only">Your answer to question {index + 1}</legend>{question.type === 'identification' ? <Field label="Your answer"><input type="text" maxLength={500} value={answers[question.id] || ''} onChange={(event) => answer(event.target.value)} autoComplete="off" /></Field> : question.options.map((option) => <label key={option.id}><input type="radio" name={`question-${question.id}`} value={option.id} checked={answers[question.id] === option.id} onChange={() => answer(option.id)} /><span>{option.text}</span></label>)}</fieldset><div className="kq-actions kq-question-actions" style={{ justifyContent: 'space-between', marginTop: 26 }}><button className="kq-button kq-button-secondary" disabled={index === 0} onClick={() => selectQuestion(index - 1)}><ArrowLeft size={15} aria-hidden="true" />Previous</button>{index < questions.length - 1 ? <button className="kq-button" onClick={() => selectQuestion(index + 1)}>Next<ArrowRight size={15} aria-hidden="true" /></button> : <button className="kq-button" onClick={() => { moveFocus.current = true; setReview(true); }}><CheckCircle2 size={16} aria-hidden="true" />Review answers</button>}</div></section>}
      {!review && <button className="kq-button kq-button-secondary" onClick={() => { moveFocus.current = true; setReview(true); }}>Review all answers</button>}
      {pending && online && <button className="kq-button kq-button-secondary" onClick={() => void sync()}>Retry synchronization</button>}
      {expired && !online && <Empty>Time has ended. Reconnect to finalize the answers received by the server before the deadline.</Empty>}
    </div>}
  </KnowledgePage>;
}
