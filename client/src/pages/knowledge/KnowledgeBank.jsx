import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import api from '../../api/axios';
import Modal from '../../components/common/Modal';
import { useDemoMode } from '../../contexts/useDemoMode';
import { Empty, Field, KnowledgePage } from './KnowledgeCommon';
import { useKnowledgeAction, useKnowledgeData } from './knowledgeClient';

const blankQuestion = { category_id: '', prompt: '', type: 'multiple_choice', options: 'Option A\nOption B\nOption C\nOption D', correct_answer: '0', accepted: '', points: 1, explanation: '' };
export default function KnowledgeBank({ categoriesOnly = false }) {
  const state = useKnowledgeData(categoriesOnly ? ['/knowledge/categories'] : ['/knowledge/categories', '/knowledge/questions']);
  const categories = state.data[0] || [], questions = state.data[1] || [];
  const { freeDemoReadOnly } = useDemoMode();
  const { busy, run } = useKnowledgeAction();
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankQuestion);
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' });
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [type, setType] = useState('');
  const filtered = questions.filter((question) => (!categoryId || question.category_id === Number(categoryId)) && (!type || question.type === type) && question.prompt.toLowerCase().includes(search.toLowerCase()));
  const open = (record = null) => {
    setEditing(record?.id || null);
    if (categoriesOnly) setCategoryForm(record || { name: '', description: '' });
    else setForm(record ? { ...record, options: record.options.map((option) => option.text).join('\n'), correct_answer: record.answers[0], accepted: record.answers.join('\n') } : blankQuestion);
    setDialog(true);
  };
  const save = async (event) => {
    event.preventDefault();
    const base = categoriesOnly ? '/knowledge/categories' : '/knowledge/questions';
    const payload = categoriesOnly ? categoryForm : { ...form, category_id: form.category_id || categories[0]?.id,
      options: form.options.split('\n').map((option) => option.trim()).filter(Boolean), accepted_answers: form.accepted.split('\n').map((answer) => answer.trim()).filter(Boolean), points: Number(form.points) };
    if (await run(() => editing ? api.put(`${base}/${editing}`, payload) : api.post(base, payload), `${categoriesOnly ? 'Category' : 'Question'} saved.`)) { setDialog(false); state.reload(); }
  };
  const remove = async (record) => {
    if (!window.confirm(`Remove ${categoriesOnly ? record.name : 'this question'}? Existing assessment snapshots and results will be preserved.`)) return;
    if (await run(() => api.delete(`/knowledge/${categoriesOnly ? 'categories' : 'questions'}/${record.id}`), 'Record removed.')) state.reload();
  };
  return <KnowledgePage title={categoriesOnly ? 'Assessment categories' : 'Knowledge question bank'} description={categoriesOnly ? 'Organize the eight core digital literacy skill areas and add categories for your curriculum.' : 'Create scored questions with accepted answers, points, and helpful explanations. Every assessment keeps its own question snapshot.'}
    {...state} action={<button className="kq-button" disabled={freeDemoReadOnly} onClick={() => open()}><Plus size={17} aria-hidden="true" />Add {categoriesOnly ? 'category' : 'question'}</button>}>
    {freeDemoReadOnly && <p className="kq-note">Editing is disabled in this read-only demonstration.</p>}
    {!categoriesOnly && <><div className="kq-actions"><Link className="kq-button kq-button-secondary" to="/admin/questions">Research questionnaire bank</Link><Link className="kq-button kq-button-secondary" to="/admin/knowledge">Create a scored assessment</Link></div>
      <div className="kq-filter-row"><Field label="Search questions"><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search question wording…" /></Field><Field label="Category"><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field><Field label="Question type"><select value={type} onChange={(event) => setType(event.target.value)}><option value="">All types</option><option value="multiple_choice">Multiple choice</option><option value="true_false">True or false</option><option value="identification">Identification</option></select></Field></div>
    </>}
    {categoriesOnly ? <div className="kq-grid">{categories.map((category) => <article className="kq-card kq-assessment-card" key={category.id}><span className="kq-badge">{category.question_count} questions · {category.material_count} materials</span><h2>{category.name}</h2><p>{category.description}</p><div className="kq-actions"><button disabled={freeDemoReadOnly || busy} className="kq-button kq-button-secondary" onClick={() => open(category)}><Pencil size={15} aria-hidden="true" />Edit</button><button disabled={freeDemoReadOnly || busy} className="kq-button kq-button-danger" onClick={() => remove(category)} aria-label={`Delete ${category.name}`}><Trash2 size={15} aria-hidden="true" />Delete</button></div></article>)}</div>
      : <div className="kq-list">{filtered.length ? filtered.map((question) => <article key={question.id} className="kq-question-row"><div><div className="kq-actions"><span className="kq-badge">{question.category_name}</span><span className="kq-badge">{question.type.replaceAll('_', ' ')}</span><span className="kq-badge">{question.points} point{question.points === 1 ? '' : 's'}</span></div><p><strong>{question.prompt}</strong></p><p className="kq-note">Accepted: {question.answers.map((answer) => question.options.find((option) => option.id === answer)?.text || answer).join(' / ')}</p></div><div className="kq-actions"><button className="kq-button kq-button-secondary" disabled={freeDemoReadOnly || busy} onClick={() => open(question)} aria-label={`Edit question ${question.id}`}><Pencil size={15} aria-hidden="true" />Edit</button><button className="kq-button kq-button-danger" disabled={freeDemoReadOnly || busy} onClick={() => remove(question)} aria-label={`Delete question ${question.id}`}><Trash2 size={15} aria-hidden="true" /></button></div></article>) : <Empty>No scored questions yet. Add your first question or change the filters.</Empty>}</div>}
    <div className="kq-modal"><Modal isOpen={dialog} onClose={() => setDialog(false)} title={`${editing ? 'Edit' : 'Add'} ${categoriesOnly ? 'category' : 'question'}`}>
      <form className="kq-form" onSubmit={save}>{categoriesOnly ? <>
        <Field label="Category name"><input required minLength={3} maxLength={80} value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} /></Field>
        <Field label="Description"><textarea rows={3} maxLength={500} value={categoryForm.description} onChange={(event) => setCategoryForm({ ...categoryForm, description: event.target.value })} /></Field>
      </> : <>
        <div className="kq-form-row"><Field label="Category"><select required value={form.category_id || categories[0]?.id || ''} onChange={(event) => setForm({ ...form, category_id: event.target.value })}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field><Field label="Question type"><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value, correct_answer: event.target.value === 'true_false' ? 'true' : '0' })}><option value="multiple_choice">Multiple choice</option><option value="true_false">True or false</option><option value="identification">Identification</option></select></Field></div>
        <Field label="Question wording"><textarea required minLength={5} maxLength={2000} rows={3} value={form.prompt} onChange={(event) => setForm({ ...form, prompt: event.target.value })} /></Field>
        {form.type === 'multiple_choice' && <Field label="Answer options" help="Enter two to six distinct options, one per line."><textarea required rows={5} value={form.options} onChange={(event) => setForm({ ...form, options: event.target.value })} /></Field>}
        {form.type === 'identification' ? <Field label="Accepted answers" help="One accepted spelling or phrase per line. Matching ignores case and extra spaces."><textarea required rows={3} value={form.accepted} onChange={(event) => setForm({ ...form, accepted: event.target.value })} /></Field>
          : <Field label="Correct answer"><select required value={form.correct_answer} onChange={(event) => setForm({ ...form, correct_answer: event.target.value })}>{(form.type === 'true_false' ? [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }] : form.options.split('\n').map((option) => option.trim()).filter(Boolean).map((option, index) => ({ id: String(index), text: option }))).map((option) => <option key={option.id} value={option.id}>{option.text}</option>)}</select></Field>}
        <Field label="Points"><input required type="number" min={1} max={100} value={form.points} onChange={(event) => setForm({ ...form, points: event.target.value })} /></Field>
        <Field label="Explanation shown after completion"><textarea maxLength={2000} rows={3} value={form.explanation} onChange={(event) => setForm({ ...form, explanation: event.target.value })} /></Field>
      </>}<div className="kq-actions"><button disabled={busy || freeDemoReadOnly} className="kq-button" type="submit">{busy ? 'Saving…' : 'Save changes'}</button><button type="button" className="kq-button kq-button-secondary" onClick={() => setDialog(false)}>Cancel</button></div></form>
    </Modal></div>
  </KnowledgePage>;
}
