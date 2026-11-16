import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, BookOpen, CheckCircle2, Circle, Clock3, Save, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { useAuth } from '../../contexts/useAuth';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Modal from '../../components/common/Modal';
import PageHeader from '../../components/common/PageHeader';

const emptyForm = { competence_area_id: '', title: '', description: '', resource_url: '', estimated_minutes: 15, is_published: false };

const instrumentFingerprint = (result) => JSON.stringify((result?.responses || [])
  .map((item) => [item.question_id, item.question_text, item.area_code])
  .sort((first, second) => Number(first[0]) - Number(second[0])));

export default function LearningHub() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [modules, setModules] = useState([]);
  const [areas, setAreas] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [historyResults, setHistoryResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [selectedArea, setSelectedArea] = useState('AUTO');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const applyHubResponses = useCallback((moduleResponse, areaResponse, attemptResponse) => {
    setModules(moduleResponse.data?.data || []);
    setAreas(areaResponse.data?.data || []);
    const completed = (attemptResponse.data?.data || []).filter((attempt) => attempt.status === 'completed')
      .sort((first, second) => String(second.completed_at || '').localeCompare(String(first.completed_at || '')));
    setAttempts(completed);
    if (!isAdmin) {
      setHistoryResults(completed.slice(0, 8).map((attempt) => attempt.learning_summary).filter(Boolean));
    }
  }, [isAdmin]);

  const loadData = useCallback(async () => {
    try {
      const [moduleResponse, areaResponse, attemptResponse] = await Promise.all([
        api.get('/learning/modules'),
        isAdmin ? api.get('/learning/areas') : Promise.resolve({ data: { data: [] } }),
        isAdmin ? Promise.resolve({ data: { data: [] } }) : api.get('/attempts/my?include=learning_summary'),
      ]);
      applyHubResponses(moduleResponse, areaResponse, attemptResponse);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not load your learning resources.');
    } finally {
      setLoading(false);
    }
  }, [applyHubResponses, isAdmin]);

  useEffect(() => {
    let active = true;
    const loadInitialData = async () => {
      try {
        const [moduleResponse, areaResponse, attemptResponse] = await Promise.all([
          api.get('/learning/modules'),
          isAdmin ? api.get('/learning/areas') : Promise.resolve({ data: { data: [] } }),
          isAdmin ? Promise.resolve({ data: { data: [] } }) : api.get('/attempts/my?include=learning_summary'),
        ]);
        if (!active) return;
        applyHubResponses(moduleResponse, areaResponse, attemptResponse);
      } catch (error) {
        if (active) toast.error(error.response?.data?.message || 'Could not load your learning resources.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadInitialData();
    return () => { active = false; };
  }, [applyHubResponses, isAdmin]);

  const latestResult = historyResults[0];
  const scoreScaleMax = latestResult?.attempt?.scoring_version === 'digcompsat-self-reflection-0-3.1' ? 3 : 4;
  const weakestArea = useMemo(() => [...(latestResult?.areaResults || [])].sort((first, second) => Number(first.weighted_mean) - Number(second.weighted_mean))[0], [latestResult]);
  const availableAreas = useMemo(() => {
    const byCode = new Map();
    for (const module of modules) {
      if (!byCode.has(module.area_code)) {
        byCode.set(module.area_code, { code: module.area_code, name: module.area_name, count: 0 });
      }
      byCode.get(module.area_code).count += 1;
    }
    return [...byCode.values()];
  }, [modules]);
  const weakestHasModules = Boolean(weakestArea && modules.some((module) => module.area_code === weakestArea.area_code));
  const activeArea = selectedArea === 'AUTO'
    ? (weakestHasModules ? weakestArea.area_code : 'ALL')
    : (selectedArea === 'ALL' || availableAreas.some((area) => area.code === selectedArea) ? selectedArea : 'ALL');
  const recommendedModules = activeArea === 'ALL'
    ? modules
    : modules.filter((module) => module.area_code === activeArea);
  const activeAreaName = availableAreas.find((area) => area.code === activeArea)?.name;
  const previousComparable = latestResult && historyResults.slice(1).find((result) => (
    result.attempt?.scoring_version === latestResult.attempt?.scoring_version
    && instrumentFingerprint(result) === instrumentFingerprint(latestResult)
  ));
  const changes = previousComparable ? (latestResult.areaResults || []).map((latest) => {
    const previous = previousComparable.areaResults?.find((area) => area.area_code === latest.area_code);
    return previous ? { ...latest, previousMean: Number(previous.weighted_mean), change: Number(latest.weighted_mean) - Number(previous.weighted_mean) } : null;
  }).filter(Boolean) : [];

  const resetForm = () => { setForm(emptyForm); setEditingId(null); };
  const handleSaveModule = async (event) => {
    event.preventDefault();
    try {
      setSaving(true);
      const payload = { ...form, competence_area_id: Number(form.competence_area_id), estimated_minutes: Number(form.estimated_minutes), is_published: Boolean(form.is_published) };
      const response = editingId ? await api.put(`/learning/modules/${editingId}`, payload) : await api.post('/learning/modules', payload);
      toast.success(response.data?.message || (editingId ? 'Learning resource updated.' : 'Learning resource added.'));
      resetForm();
      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save the resource.');
    } finally {
      setSaving(false);
    }
  };

  const editModule = (module) => {
    setEditingId(module.id);
    setForm({ competence_area_id: module.competence_area_id, title: module.title, description: module.description, resource_url: module.resource_url, estimated_minutes: module.estimated_minutes, is_published: Boolean(module.is_published) });
    document.getElementById('learning-module-title')?.focus();
  };

  const togglePublished = async (module) => {
    try {
      await api.put(`/learning/modules/${module.id}`, { competence_area_id: module.competence_area_id, title: module.title, description: module.description, resource_url: module.resource_url, estimated_minutes: module.estimated_minutes, is_published: !module.is_published });
      await loadData();
      toast.success(module.is_published ? 'Resource unpublished.' : 'Resource published.');
    } catch (error) { toast.error(error.response?.data?.message || 'Could not update the resource.'); }
  };

  const confirmDeleteModule = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/learning/modules/${deleteTarget.id}`);
      await loadData();
      toast.success('Resource deleted.');
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not delete the resource.');
    } finally {
      setDeleting(false);
    }
  };

  const toggleCompleted = async (module) => {
    try {
      if (module.completed) await api.delete(`/learning/modules/${module.id}/complete`);
      else await api.post(`/learning/modules/${module.id}/complete`);
      setModules((current) => current.map((item) => item.id === module.id ? { ...item, completed: !module.completed, completed_at: module.completed ? null : new Date().toISOString() } : item));
    } catch (error) { toast.error(error.response?.data?.message || 'Could not save learning progress.'); }
  };

  if (loading) return <LoadingSpinner text="Loading learning resources…" />;

  return <div className="mx-auto max-w-6xl space-y-6">
    <PageHeader eyebrow={isAdmin ? 'Administration · Learning program' : 'Your growth · DigComp 2.1'} title={isAdmin ? 'Learning resources' : 'Your learning path'} description={isAdmin ? 'Publish approved resources for each digital competence area and let students track completion.' : 'Explore resources for your focus areas and compare results when you repeat the same assessment instrument.'} />

    {isAdmin ? <section className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <form onSubmit={handleSaveModule} className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-green-800">{editingId ? 'Edit resource' : 'Add resource'}</p><h2 className="mt-1 text-lg font-bold text-slate-900">{editingId ? 'Update learning resource' : 'Create a learning resource'}</h2></div>{editingId && <button type="button" onClick={resetForm} className="min-h-9 rounded-lg px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel edit</button>}</div>
        <div><label htmlFor="learning-module-title" className="mb-1.5 block text-xs font-semibold text-slate-700">Title</label><input id="learning-module-title" required minLength={3} maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-600/15" /></div>
        <div><label htmlFor="learning-module-area" className="mb-1.5 block text-xs font-semibold text-slate-700">Competence area</label><select id="learning-module-area" required value={form.competence_area_id} onChange={(event) => setForm({ ...form, competence_area_id: event.target.value })} className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"><option value="">Choose an area</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></div>
        <div><label htmlFor="learning-module-description" className="mb-1.5 block text-xs font-semibold text-slate-700">Short description</label><textarea id="learning-module-description" required minLength={10} maxLength={1000} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-5" /></div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]"><div><label htmlFor="learning-module-url" className="mb-1.5 block text-xs font-semibold text-slate-700">Secure resource link (HTTPS)</label><input id="learning-module-url" type="url" required maxLength={500} value={form.resource_url} onChange={(event) => setForm({ ...form, resource_url: event.target.value })} placeholder="https://…" className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm" /></div><div><label htmlFor="learning-module-minutes" className="mb-1.5 block text-xs font-semibold text-slate-700">Minutes</label><input id="learning-module-minutes" type="number" min="1" max="600" required value={form.estimated_minutes} onChange={(event) => setForm({ ...form, estimated_minutes: event.target.value })} className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm" /></div></div>
        <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 px-3 text-sm text-slate-700"><input type="checkbox" checked={form.is_published} onChange={(event) => setForm({ ...form, is_published: event.target.checked })} className="h-4 w-4 accent-green-700" />Visible to students</label>
        <button type="submit" disabled={saving} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-green-700 px-4 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"><Save aria-hidden="true" className="h-4 w-4" />{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add resource'}</button>
      </form>
      <div className="space-y-3">
        {modules.length ? modules.map((module) => <article key={module.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-green-50 px-2.5 py-1 text-[10px] font-bold text-green-800">{module.area_name}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${module.is_published ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{module.is_published ? 'Published' : 'Draft'}</span></div><h3 className="mt-2 font-bold text-slate-900">{module.title}</h3><p className="mt-1 text-sm leading-5 text-slate-600">{module.description}</p><a href={module.resource_url} target="_blank" rel="noreferrer" className="mt-2 inline-block break-all text-xs font-semibold text-green-800 underline">{module.resource_url}</a></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => editModule(module)} className="min-h-10 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit</button><button type="button" onClick={() => togglePublished(module)} className="min-h-10 rounded-lg border border-green-200 px-3 text-xs font-semibold text-green-800 hover:bg-green-50">{module.is_published ? 'Unpublish' : 'Publish'}</button><button type="button" onClick={() => setDeleteTarget(module)} aria-label={`Delete ${module.title}`} className="flex min-h-10 w-10 items-center justify-center rounded-lg border border-rose-100 text-rose-700 hover:bg-rose-50"><Trash2 aria-hidden="true" className="h-4 w-4" /></button></div></div>
        </article>) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No learning resources yet. Add approved links for the five DigComp areas.</div>}
      </div>
    </section> : <>
      {latestResult && <section className="rounded-2xl border border-green-100 bg-gradient-to-br from-green-50/70 to-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><p className="text-[11px] font-bold uppercase tracking-wide text-green-800">Recommended focus</p><h2 className="mt-1 text-xl font-bold text-slate-900">{weakestArea?.area_name || 'Keep building your digital skills'}</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{weakestArea ? `Your latest score in this area is ${Number(weakestArea.weighted_mean).toFixed(2)} / ${scoreScaleMax}. ${weakestHasModules ? 'Explore an approved resource below and track it when complete.' : modules.length > 0 ? 'No resources are published for this area yet — browse resources from other areas below.' : 'Check back when approved resources are published.'}` : 'Complete another assessment to receive a focus recommendation.'}</p></div><span className="rounded-xl border border-green-100 bg-white px-3 py-2 text-xs font-semibold text-green-800">Latest result · {latestResult.attempt?.assessment_title}</span></div>
        {changes.length > 0 && <div className="mt-5 border-t border-green-100 pt-4"><p className="mb-3 text-xs font-bold text-slate-700">Progress since your previous matching assessment</p><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{changes.map((area) => { const improving = area.change > 0.005; const falling = area.change < -0.005; const Icon = improving ? ArrowUpRight : falling ? ArrowDownRight : Circle; return <div key={area.area_code} className="rounded-xl border border-white bg-white/90 p-3"><p className="text-[11px] font-semibold text-slate-500">{area.area_name}</p><div className="mt-1 flex items-center gap-1.5"><Icon aria-hidden="true" className={`h-4 w-4 ${improving ? 'text-emerald-700' : falling ? 'text-amber-700' : 'text-slate-400'}`} /><span className="text-sm font-bold text-slate-900">{Number(area.weighted_mean).toFixed(2)}</span><span className="text-xs text-slate-500">{area.change > 0 ? '+' : ''}{area.change.toFixed(2)}</span></div></div>; })}</div></div>}
        {!previousComparable && attempts.length > 1 && <p className="mt-4 border-t border-green-100 pt-3 text-xs leading-5 text-slate-500">A score comparison appears when two completed assessments use the same question wording and scoring version.</p>}
      </section>}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-green-800">Approved resources</p>
            <h2 className="text-lg font-bold text-slate-900">{activeArea !== 'ALL' && activeAreaName ? activeAreaName : 'All competence areas'}</h2>
          </div>
          <span className="text-xs text-slate-500">
            {recommendedModules.filter((module) => module.completed).length} of {recommendedModules.length} completed
            {activeArea !== 'ALL' && modules.length !== recommendedModules.length ? ` (${modules.filter((module) => module.completed).length}/${modules.length} total)` : ''}
          </span>
        </div>
        {availableAreas.length > 1 && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter learning resources by competence area">
            <button
              type="button"
              onClick={() => setSelectedArea('ALL')}
              aria-pressed={activeArea === 'ALL'}
              className={`min-h-9 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${activeArea === 'ALL' ? 'border-green-700 bg-green-700 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              All areas ({modules.length})
            </button>
            {availableAreas.map((area) => {
              const isSelected = activeArea === area.code;
              const isFocus = weakestArea?.area_code === area.code;
              return (
                <button
                  key={area.code}
                  type="button"
                  onClick={() => setSelectedArea(area.code)}
                  aria-pressed={isSelected}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${isSelected ? 'border-green-700 bg-green-700 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                >
                  <span>{area.name} ({area.count})</span>
                  {isFocus && (
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${isSelected ? 'bg-white/20 text-white' : 'bg-green-50 text-green-800'}`}>
                      Focus
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {recommendedModules.length ? recommendedModules.map((module) => <article key={module.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:p-5">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${module.completed ? 'bg-emerald-50 text-emerald-700' : 'bg-green-50 text-green-800'}`}>{module.completed ? <CheckCircle2 aria-hidden="true" className="h-5 w-5" /> : <BookOpen aria-hidden="true" className="h-5 w-5" />}</span>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{module.area_name}</span><span className="inline-flex items-center gap-1 text-[11px] text-slate-500"><Clock3 aria-hidden="true" className="h-3 w-3" />{module.estimated_minutes} min</span></div><h3 className="mt-1.5 font-bold text-slate-900">{module.title}</h3><p className="mt-1 text-sm leading-5 text-slate-600">{module.description}</p><p className="mt-1 text-[11px] text-slate-500">{module.completed ? `Completed ${new Date(module.completed_at).toLocaleDateString()}` : 'Open the resource, then mark it complete when you finish.'}</p></div>
          <div className="flex shrink-0 flex-col gap-2 sm:w-40"><a href={module.resource_url} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-green-700 px-3 text-xs font-semibold text-white hover:bg-green-800">Open resource <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></a><button type="button" onClick={() => toggleCompleted(module)} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">{module.completed ? <><Circle aria-hidden="true" className="h-3.5 w-3.5" />Mark unfinished</> : <><CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />Mark complete</>}</button></div>
        </article>) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><BookOpen aria-hidden="true" className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 text-sm font-semibold text-slate-700">No published resources yet</p><p className="mt-1 text-xs text-slate-500">Your College will add approved learning materials here.</p></div>}
      </section>
    </>}
    <Modal
      isOpen={Boolean(deleteTarget)}
      onClose={() => !deleting && setDeleteTarget(null)}
      title="Delete learning resource"
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <p className="text-sm leading-6 text-slate-600">
          Delete <strong className="text-slate-900">“{deleteTarget?.title}”</strong>? Student completion records for this resource will also be removed.
        </p>
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            disabled={deleting}
            onClick={() => setDeleteTarget(null)}
            className="min-h-10 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={confirmDeleteModule}
            className="min-h-10 rounded-xl bg-rose-700 px-4 text-xs font-bold text-white hover:bg-rose-800 disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete resource'}
          </button>
        </div>
      </div>
    </Modal>
  </div>;
}
