import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Plus, Clock3 } from 'lucide-react';
import api from '../../api/axios';
import Modal from '../../components/common/Modal';
import { useAuth } from '../../contexts/useAuth';
import { useDemoMode } from '../../contexts/useDemoMode';
import { Empty, Field, KnowledgePage, ResearchLink } from './KnowledgeCommon';
import { displayDate, useKnowledgeAction, useKnowledgeData } from './knowledgeClient';
import { BookmarkButton, BookmarkFilter } from '../../components/assessments/AssessmentBookmarks';
import { useAssessmentBookmarks } from '../../components/assessments/useAssessmentBookmarks';
import { knowledgeQuizState } from './attemptStatus';

function StudentPicker({ selected, setSelected }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const state = useKnowledgeData([`/knowledge/students?search=${encodeURIComponent(search)}&page=${page}`]);
  const directory = state.data[0];
  return <div className="kq-form"><Field label="Find active, verified students"><input type="search" value={search} placeholder="Search name or email…" onChange={(event) => { setPage(1); setSearch(event.target.value); }} /></Field>
    <p className="kq-note">{selected.length} selected · selections are retained while searching.</p>
    <div className="kq-picker">{directory?.users.map((student) => <label className="kq-check" key={student.id}><input type="checkbox" checked={selected.includes(student.id)} onChange={() => setSelected(selected.includes(student.id) ? selected.filter((value) => value !== student.id) : [...selected, student.id])} /><span>{student.first_name} {student.last_name}<br /><small>{student.email}</small></span></label>)}{!directory?.users.length && <Empty>{state.loading ? 'Loading students…' : state.error || 'No matching verified students.'}</Empty>}</div>
    {directory && <div className="kq-actions"><button type="button" className="kq-button kq-button-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span className="kq-note">Page {page} of {directory.pages}</span><button type="button" className="kq-button kq-button-secondary" disabled={page >= directory.pages} onClick={() => setPage(page + 1)}>Next</button></div>}
  </div>;
}
const blankForm = { title: '', description: '', instructions: 'Answer independently. Review all answers before submitting. Your responses and score will be saved to your account.', time_limit_minutes: 20, max_attempts: 2, pass_percentage: 70, randomize: true, assign_all: true, assigned_user_ids: [], question_ids: [], status: 'draft', start_date: '', end_date: '' };

export default function KnowledgeAssessments() {
  const bookmarks = useAssessmentBookmarks('knowledge');
  const [showBookmarks, setShowBookmarks] = useState(false);
  const { user } = useAuth(); const student = user?.role === 'respondent';
  const { freeDemoReadOnly } = useDemoMode();
  const state = useKnowledgeData(student ? ['/knowledge/quizzes'] : ['/knowledge/quizzes', '/knowledge/questions', '/knowledge/categories']);
  const quizzes = state.data[0] || [], questions = state.data[1] || [], categories = state.data[2] || [];
  const { busy, run } = useKnowledgeAction(); const navigate = useNavigate();
  const [search, setSearch] = useState(''); const [category, setCategory] = useState('');
  const [formOpen, setFormOpen] = useState(false); const [form, setForm] = useState(blankForm);
  const [preview, setPreview] = useState(null); const [accepted, setAccepted] = useState(false);
  const [assignQuiz, setAssignQuiz] = useState(null); const [selectedStudents, setSelectedStudents] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  const filtered = quizzes.filter((quiz) => (!showBookmarks || bookmarks.saved.includes(quiz.id)) && `${quiz.title} ${quiz.description}`.toLowerCase().includes(search.toLowerCase()));
  const bank = questions.filter((question) => !category || question.category_id === Number(category));
  const base = user?.role === 'admin' ? '/admin' : '/respondent';
  const create = async (event) => {
    event.preventDefault();
    const payload = { ...form, time_limit_minutes: form.time_limit_minutes ? Number(form.time_limit_minutes) : null,
      start_date: form.start_date ? new Date(form.start_date).toISOString() : null, end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
      max_attempts: Number(form.max_attempts), pass_percentage: Number(form.pass_percentage) };
    if (await run(() => api.post('/knowledge/quizzes', payload), 'Assessment created.')) { setFormOpen(false); state.reload(); }
  };
  const changeStatus = async (quiz, status) => {
    const prompt = status === 'archived'
      ? `Permanently close “${quiz.title}” to new attempts? Students can finish their open attempts.`
      : `${status === 'published' ? 'Publish' : 'Unpublish'} “${quiz.title}”?`;
    if (!window.confirm(prompt)) return;
    if (await run(() => api.put(`/knowledge/quizzes/${quiz.id}/status`, { status }), 'Assessment status updated.')) state.reload();
  };
  const remove = async (quiz) => {
    if (!window.confirm(`Delete “${quiz.title}”? Assessments with attempts must be archived instead.`)) return;
    if (await run(() => api.delete(`/knowledge/quizzes/${quiz.id}`), 'Assessment deleted.')) state.reload();
  };
  const view = async (quiz) => { setAccepted(false); if (student) setPreview(quiz); else { const response = await run(() => api.get(`/knowledge/quizzes/${quiz.id}`)); if (response) setPreview(response.data.data); } };
  const begin = async () => {
    const response = await run(() => api.post(`/knowledge/quizzes/${preview.id}/start`, {
      accepted_instructions: accepted,
      timer_protocol: 'connection-lease',
    }));
    if (response) navigate(`/respondent/knowledge/attempts/${response.data.data.attempt.id}`);
  };
  return <KnowledgePage {...state} className={student ? 'student-assessment-browser' : ''} title={student ? 'Take an assessment' : 'Assessment management'} description={student ? 'Choose an assessment, read the instructions, and continue where you left off.' : 'Scored knowledge assessments use correct answers, points, and percentage proficiency levels. Research questionnaires have a separate workflow.'}
    action={student ? <ResearchLink to="/respondent/assessments" /> : <button className="kq-button" disabled={freeDemoReadOnly || !questions.length} onClick={() => { setForm(blankForm); setFormOpen(true); }}><Plus size={17} aria-hidden="true" />Create assessment</button>}>
    {!student && <div className="kq-actions"><ResearchLink to={'/admin/assessments'}>Manage research assessments</ResearchLink>{user.role === 'admin' && <Link className="kq-button kq-button-secondary" to="/admin/knowledge/questions">Open scored question bank</Link>}</div>}
    {freeDemoReadOnly && <p className="kq-note">This demonstration is read-only. You can view assessments; starting attempts and editing are disabled.</p>}
    <Field label="Search assessments"><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by title or description…" /></Field>
    <BookmarkFilter bookmarks={bookmarks} records={quizzes} selected={showBookmarks} setSelected={setShowBookmarks} />
    <div className="kq-grid">{filtered.map((quiz) => {
      const { ongoing, expired, paused, pausable, exhausted, closed, future, locked, label } = knowledgeQuizState(quiz, now);
      return <article className="kq-card kq-assessment-card" key={quiz.id}>
        <div className="assessment-bookmark-heading"><div className="kq-actions"><span className="kq-badge">{student ? label : quiz.status}</span><span className="kq-badge">{quiz.question_count} questions</span>{quiz.stage && <span className="kq-badge">{quiz.stage === 'baseline' ? 'Baseline' : 'Follow-up'}</span>}</div><BookmarkButton assessment={quiz} bookmarks={bookmarks} /></div>
        <h2>{quiz.title}</h2><p>{quiz.description || 'Evaluate your digital literacy knowledge across selected categories.'}</p>
        {student && locked && <p className="kq-note">Complete {quiz.prerequisite_title || 'the baseline'} to unlock this assessment. No minimum baseline score is required.</p>}
        {student && paused && <p className="kq-note">Reconnect and resume to continue with your saved answers and remaining time.</p>}
        {student && ongoing && !expired && !pausable && quiz.time_limit_minutes && <p className="kq-note">This attempt has a fixed timer. It keeps running if you disconnect or close the browser.</p>}
        {student && expired && <p className="kq-note">{pausable || !quiz.time_limit_minutes
          ? 'Time has ended. Your saved answers are still available.'
          : 'The timer continued while you were away. Your saved answers are kept; this attempt ended when time ran out.'}</p>}
        {student && (ongoing || expired) && Number.isInteger(quiz.latest_answered_count) && <p className="kq-note">{quiz.latest_answered_count} of {quiz.question_count} answers saved to the server.</p>}
        {!student && quiz.auto_assign_verified === 1 && <p className="kq-note">Automatically assigned to current and newly verified students while published.</p>}
        <div className="kq-note"><p><Clock3 size={13} className="inline" aria-hidden="true" /> {quiz.time_limit_minutes ? `${quiz.time_limit_minutes} minutes` : 'No time limit'} · Certificate at {quiz.pass_percentage}%</p><p>{student ? `${quiz.attempt_count}/${quiz.max_attempts} attempts used` : `${quiz.assigned_count} assigned · ${quiz.completed_count} submissions`}</p>{quiz.start_date && <p>Opens {displayDate(quiz.start_date)}</p>}{quiz.end_date && <p>Deadline {displayDate(quiz.end_date)}</p>}</div>
        <div className="kq-actions">{student ? <>
          {ongoing ? <Link className="kq-button" to={`/respondent/knowledge/attempts/${quiz.latest_attempt_id}`}>{expired ? 'View saved attempt' : 'Resume assessment'}<ArrowRight size={15} aria-hidden="true" /></Link> : <button className="kq-button" disabled={freeDemoReadOnly || exhausted || closed || future} onClick={() => view(quiz)}>{quiz.attempt_count ? 'Take again' : 'View instructions'}</button>}
          {quiz.latest_status === 'completed' && <Link className="kq-button kq-button-secondary" to={`/respondent/knowledge/attempts/${quiz.latest_attempt_id}`}>{expired ? 'View saved result' : 'View result'}</Link>}
        </> : <>
          <button className="kq-button kq-button-secondary" onClick={() => view(quiz)}>View</button>
          {quiz.status !== 'archived' && <button className="kq-button kq-button-secondary" disabled={busy || freeDemoReadOnly} onClick={() => changeStatus(quiz, quiz.status === 'published' ? 'draft' : 'published')}>{quiz.status === 'published' ? 'Unpublish' : 'Publish'}</button>}
          <button className="kq-button kq-button-secondary" disabled={freeDemoReadOnly} onClick={() => { setAssignQuiz(quiz); setSelectedStudents([]); }}>Assign students</button>
          <button className="kq-button kq-button-secondary" disabled={busy || freeDemoReadOnly || quiz.status === 'archived'} onClick={() => changeStatus(quiz, 'archived')}>Archive</button>
          <button className="kq-button kq-button-danger" disabled={busy || freeDemoReadOnly} onClick={() => remove(quiz)}>Delete</button>
        </>}</div>
      </article>;
    })}</div>{!filtered.length && <Empty>{showBookmarks ? 'No bookmarked assessments match. Use Bookmark on an assessment to save it, or select All assessments and adjust your search.' : quizzes.length ? 'No assessments match your search. Try another title or description.' : student ? 'No knowledge assessments are assigned yet. Research assessments remain available using the button above.' : questions.length ? 'No assessments yet. Create one from the scored question bank.' : 'Add scored questions to the question bank before creating an assessment.'}</Empty>}
    <div className="kq-modal"><Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title="Create knowledge assessment" maxWidth="max-w-4xl"><form className="kq-form" onSubmit={create}>
      <Field label="Assessment title"><input required minLength={3} maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Field>
      <Field label="Description"><textarea rows={2} maxLength={2000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
      <Field label="Student instructions"><textarea rows={3} maxLength={3000} value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} /></Field>
      <div className="kq-form-row"><Field label="Time limit in minutes (optional)"><input type="number" min={1} max={180} value={form.time_limit_minutes} onChange={(event) => setForm({ ...form, time_limit_minutes: event.target.value })} /></Field><Field label="Maximum attempts"><input required type="number" min={1} max={10} value={form.max_attempts} onChange={(event) => setForm({ ...form, max_attempts: event.target.value })} /></Field></div>
      <div className="kq-form-row"><Field label="Certificate threshold (%)"><input required type="number" min={1} max={100} value={form.pass_percentage} onChange={(event) => setForm({ ...form, pass_percentage: event.target.value })} /></Field><Field label="Publication status"><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="draft">Draft</option><option value="published">Published</option></select></Field></div>
      <div className="kq-form-row"><Field label="Opening date (optional)"><input type="datetime-local" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} /></Field><Field label="Deadline (optional)"><input type="datetime-local" value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} /></Field></div>
      <label className="kq-check"><input type="checkbox" checked={form.randomize} onChange={(event) => setForm({ ...form, randomize: event.target.checked })} />Randomize questions and multiple-choice options for each attempt</label>
      <label className="kq-check"><input type="checkbox" checked={form.assign_all} onChange={(event) => setForm({ ...form, assign_all: event.target.checked })} />Assign to all currently active, verified students</label>
      {!form.assign_all && <StudentPicker selected={form.assigned_user_ids} setSelected={(values) => setForm({ ...form, assigned_user_ids: values })} />}
      <div className="kq-section-title"><h3>Select questions · {form.question_ids.length} selected</h3><Field label="Filter category"><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></div>
      <div className="kq-actions"><button type="button" className="kq-button kq-button-secondary" onClick={() => setForm({ ...form, question_ids: [...new Set([...form.question_ids, ...bank.map((question) => question.id)])] })}>Select visible</button><button type="button" className="kq-button kq-button-secondary" onClick={() => setForm({ ...form, question_ids: [] })}>Clear selection</button></div>
      <div className="kq-picker">{bank.map((question) => <label className="kq-check" key={question.id}><input type="checkbox" checked={form.question_ids.includes(question.id)} onChange={() => setForm({ ...form, question_ids: form.question_ids.includes(question.id) ? form.question_ids.filter((value) => value !== question.id) : [...form.question_ids, question.id] })} /><span>{question.prompt}<br /><small>{question.category_name} · {question.type.replaceAll('_', ' ')} · {question.points} points</small></span></label>)}</div>
      <p className="kq-note">Question wording, answers, points, and certificate threshold are snapshotted at creation. Create a new assessment for a revised instrument; past results remain unchanged.</p>
      <div className="kq-actions"><button type="submit" className="kq-button" disabled={busy || !form.question_ids.length || freeDemoReadOnly}>{busy ? 'Creating…' : 'Create assessment'}</button><button type="button" className="kq-button kq-button-secondary" onClick={() => setFormOpen(false)}>Cancel</button></div>
    </form></Modal></div>
    <div className="kq-modal"><Modal isOpen={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.title || 'Assessment instructions'}>
      {preview && <div className="kq-form"><p className="kq-guide">{preview.instructions || 'Read each question carefully and answer independently.'}</p><p className="kq-note">{preview.time_limit_minutes || 'No'} minute time limit · {preview.max_attempts} permitted attempt(s) · Certificate threshold {preview.pass_percentage}%.</p>
        {student ? <>
          <p className="kq-note">Answers are linked to your account. A recovery copy is saved in this browser. You need internet access to submit. When time expires, only answers received by the server are scored.</p>
          {preview.time_limit_minutes && <p className="kq-note">If the connection drops or your device shuts down, the attempt timer pauses after a short delay. Reconnect and resume to recover your saved answers and remaining time. Questions and answer entry are paused until you reconnect.</p>}
          {preview.end_date && <p className="kq-note">The assessment closes at {displayDate(preview.end_date)}, even if your attempt timer is paused.</p>}
          <p className="kq-note">Available browser and sign-in signals are recorded for instructor review. Answer keys stay hidden until the assessment closes.</p>
          {preview.prerequisite_quiz_id && !preview.prerequisite_completed && <p className="kq-note" role="status">Finish every baseline question and submit before beginning this follow-up. An incomplete timed-out baseline does not unlock it; no minimum score is required.</p>}
          <label className="kq-check"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />I have read the instructions and will answer independently using my own knowledge.</label>
          <button className="kq-button" disabled={busy || !accepted || freeDemoReadOnly || (preview.prerequisite_quiz_id && !preview.prerequisite_completed)} onClick={begin}>{busy ? 'Starting…' : 'Begin assessment'}</button>
        </>
          : <><p className="kq-note">{preview.assigned_user_ids?.length} assigned students · Version {preview.snapshot?.version}</p><div className="kq-list">{preview.snapshot?.questions.map((question, index) => <div className="kq-question-row" key={question.id}><div><strong>{index + 1}. {question.prompt}</strong><p>{question.category_name} · {question.points} points</p></div></div>)}</div></>}
      </div>}
    </Modal></div>
    <div className="kq-modal"><Modal isOpen={Boolean(assignQuiz)} onClose={() => setAssignQuiz(null)} title={`Assign students: ${assignQuiz?.title || ''}`}><div className="kq-form"><StudentPicker selected={selectedStudents} setSelected={setSelectedStudents} /><button className="kq-button" disabled={busy || !selectedStudents.length || freeDemoReadOnly} onClick={async () => { if (await run(() => api.post(`/knowledge/quizzes/${assignQuiz.id}/assign`, { user_ids: selectedStudents }), 'Students assigned.')) { setAssignQuiz(null); state.reload(); } }}>Assign selected students</button></div></Modal></div>
    {!student && <Link to={`${base}/results`} className="kq-note">Open student assessment results →</Link>}
  </KnowledgePage>;
}
