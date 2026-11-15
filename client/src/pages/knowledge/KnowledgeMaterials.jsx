import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, CheckCircle2, Plus } from 'lucide-react';
import api from '../../api/axios';
import Modal from '../../components/common/Modal';
import { useAuth } from '../../contexts/useAuth';
import { useDemoMode } from '../../contexts/useDemoMode';
import { Empty, Field, KnowledgePage, ResearchLink } from './KnowledgeCommon';
import { useKnowledgeAction, useKnowledgeData } from './knowledgeClient';

const blank = { category_id: '', title: '', content: '', resource_url: '', is_published: true };
export default function KnowledgeMaterials() {
  const { user } = useAuth(); const admin = user.role === 'admin';
  const { freeDemoReadOnly } = useDemoMode(); const [params] = useSearchParams();
  const state = useKnowledgeData(['/knowledge/materials', '/knowledge/categories', '/knowledge/overview']);
  const materials = state.data[0] || [], categories = state.data[1] || [], overview = state.data[2];
  const { busy, run } = useKnowledgeAction();
  const [category, setCategory] = useState(params.get('category') || ''), [search, setSearch] = useState('');
  const [form, setForm] = useState(blank), [editing, setEditing] = useState(null), [open, setOpen] = useState(false);
  const weak = new Set(overview?.categories.filter((item) => item.percentage < 70).map((item) => item.id) || []);
  const filtered = materials.filter((material) => (!category || material.category_id === Number(category)) && `${material.title} ${material.content}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => Number(weak.has(b.category_id)) - Number(weak.has(a.category_id)));
  const save = async (event) => {
    event.preventDefault();
    if (await run(() => editing ? api.put(`/knowledge/materials/${editing}`, { ...form, category_id: form.category_id || categories[0]?.id }) : api.post('/knowledge/materials', { ...form, category_id: form.category_id || categories[0]?.id }), 'Learning guide saved.')) { setOpen(false); state.reload(); }
  };
  const remove = async (material) => {
    if (!window.confirm(`Delete “${material.title}” and its completion records?`)) return;
    if (await run(() => api.delete(`/knowledge/materials/${material.id}`), 'Learning guide deleted.')) state.reload();
  };
  return <KnowledgePage {...state} title="Learning materials" description="Build practical skills with guides for all eight digital literacy categories. Explore recommended areas and track completed learning."
    action={admin ? <button className="kq-button" disabled={freeDemoReadOnly} onClick={() => { setEditing(null); setForm(blank); setOpen(true); }}><Plus size={17} aria-hidden="true" />Add learning guide</button> : <ResearchLink to="/respondent/learning">Research learning path</ResearchLink>}>
    {admin && <ResearchLink to="/admin/learning">Manage research learning resources</ResearchLink>}
    {!admin && <section className="kq-hero"><div><p className="kq-eyebrow">Your learning journey</p><h2>{materials.filter((material) => material.completed).length} of {materials.length} guides completed</h2><p>{weak.size ? 'Recommended guides appear first, based on knowledge categories scoring below 70%.' : 'Explore a guide, practice the skill, and mark it complete when you finish.'}</p></div><BookOpen size={36} color="#2563eb" aria-hidden="true" /></section>}
    <div className="kq-filter-row"><Field label="Search learning materials"><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a skill or topic…" /></Field><Field label="Category"><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></div>
    <div className="kq-list">{filtered.map((material) => <article className="kq-card kq-assessment-card" key={material.id}><div className="kq-actions"><span className="kq-badge">{material.category_name}</span>{!admin && weak.has(material.category_id) && <span className="kq-badge kq-badge-warning">Recommended for you</span>}{Boolean(material.completed) && <span className="kq-badge kq-badge-success"><CheckCircle2 size={13} aria-hidden="true" />Completed</span>}{admin && !material.is_published && <span className="kq-badge kq-badge-warning">Draft</span>}</div><details><summary className="cursor-pointer"><h2 className="inline">{material.title}</h2><span className="kq-note"> · Open guide</span></summary><p className="kq-guide" style={{ marginTop: 18 }}>{material.content}</p></details><div className="kq-actions">{material.resource_url && <a className="kq-button kq-button-secondary" href={material.resource_url} target="_blank" rel="noreferrer">Open additional resource ↗</a>}{admin ? <><button className="kq-button kq-button-secondary" disabled={freeDemoReadOnly || busy} onClick={() => { setForm({ ...material, is_published: Boolean(material.is_published) }); setEditing(material.id); setOpen(true); }}>Edit</button><button className="kq-button kq-button-danger" disabled={freeDemoReadOnly || busy} onClick={() => remove(material)}>Delete</button></> : <button className={`kq-button ${material.completed ? 'kq-button-secondary' : ''}`} disabled={busy || freeDemoReadOnly} onClick={async () => { if (await run(() => api.put(`/knowledge/materials/${material.id}/completion`, { completed: !material.completed }), 'Learning progress saved.')) state.reload(); }}>{material.completed ? 'Mark unfinished' : 'Mark complete'}</button>}</div></article>)}</div>
    {!filtered.length && <Empty>No learning materials match these filters.</Empty>}
    <div className="kq-modal"><Modal isOpen={open} onClose={() => setOpen(false)} title={editing ? 'Edit learning guide' : 'Add learning guide'}><form className="kq-form" onSubmit={save}><Field label="Category"><select required value={form.category_id || categories[0]?.id || ''} onChange={(event) => setForm({ ...form, category_id: event.target.value })}>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Title"><input required minLength={3} maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Field><Field label="Learning guide" help="Use plain text, examples, and practical steps. Editing a guide resets its completion records."><textarea required minLength={20} maxLength={12000} rows={9} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} /></Field><Field label="Additional resource URL (optional, HTTPS)"><input type="url" maxLength={500} value={form.resource_url} onChange={(event) => setForm({ ...form, resource_url: event.target.value })} /></Field><label className="kq-check"><input type="checkbox" checked={form.is_published} onChange={(event) => setForm({ ...form, is_published: event.target.checked })} />Published for students</label><div className="kq-actions"><button className="kq-button" disabled={busy || freeDemoReadOnly} type="submit">{busy ? 'Saving…' : 'Save guide'}</button><button className="kq-button kq-button-secondary" type="button" onClick={() => setOpen(false)}>Cancel</button></div></form></Modal></div>
  </KnowledgePage>;
}
