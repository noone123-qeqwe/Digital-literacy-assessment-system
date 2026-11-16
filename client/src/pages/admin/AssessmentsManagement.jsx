import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/useAuth';
import api from '../../api/axios';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import PageHeader from '../../components/common/PageHeader';
import {
  ClipboardList,
  Plus,
  Users,
  Clock,
  CheckCircle2,
  FileSpreadsheet,
  ChevronRight,
  Archive,
  Pencil,
  RotateCcw,
  BellRing,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDateTime, getStatusBadge, parseStoredDate } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { downloadProtectedFile } from '../../utils/download';
import { BookmarkButton, BookmarkFilter } from '../../components/assessments/AssessmentBookmarks';
import { useAssessmentBookmarks } from '../../components/assessments/useAssessmentBookmarks';
import './AssessmentsManagement.css';

export const AssessmentsManagement = () => {
  const bookmarks = useAssessmentBookmarks('research');
  const [showBookmarks, setShowBookmarks] = useState(false);
  const { isAdmin } = useAuth();
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState(null);
  const [selectedAssessment, setSelectedAssessment] = useState(null);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [reopeningAttemptId, setReopeningAttemptId] = useState(null);
  const [participantsNow, setParticipantsNow] = useState(() => Date.now());
  const [remindingId, setRemindingId] = useState(null);

  // Creation form state
  const [questions, setQuestions] = useState([]);
  const [respondents, setRespondents] = useState([]);
  const [formData, setFormData] = useState({
    title: 'Digital Literacy Assessment 2026-2027',
    description: 'Comprehensive digital literacy assessment for BSCS Freshmen anchored on the European DigComp 2.1 Framework.',
    time_limit_minutes: 30,
    max_attempts: 1,
    start_date: '',
    end_date: '',
    consent_required: true,
    instrument_code: 'dlas-thesis-v1',
    selectedQuestions: [],
    selectedUsers: [],
  });

  const fetchAssessments = useCallback(async () => {
    try {
      const res = await api.get('/assessments');
      if (res.data.success) {
        setAssessments(res.data.data);
      }
    } catch {
      toast.error('Failed to load assessments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const loadAssessments = async () => {
      try {
        const response = await api.get('/assessments');
        if (active && response.data.success) setAssessments(response.data.data);
      } catch {
        if (active) toast.error('Failed to load assessments');
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadAssessments();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isParticipantsOpen) return undefined;
    const timer = window.setInterval(() => setParticipantsNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [isParticipantsOpen]);

  const loadRespondents = async () => {
    const people = [];
    let page = 1;
    let totalPages = 1;
    do {
      const response = await api.get(`/users?role=respondent&status=active&limit=100&page=${page}`);
      people.push(...response.data.data.users);
      totalPages = response.data.data.pagination.totalPages;
      page += 1;
    } while (page <= totalPages);
    setRespondents(people);
    return people;
  };

  const openCreateModal = async () => {
    try {
      setFormData((prev) => ({ ...prev, consent_required: true }));
      // Load questions and respondents
      const [qRes, people] = await Promise.all([
        api.get('/questions?active_only=true&instrument_code=dlas-thesis-v1'),
        loadRespondents(),
      ]);

      if (qRes.data.success) {
        setQuestions(qRes.data.data);
        // By default select all active questions (all 30)
        setFormData((prev) => ({
          ...prev,
          selectedQuestions: qRes.data.data.map((q) => q.id),
        }));
      }

      setFormData((prev) => ({ ...prev, selectedUsers: people.map((u) => u.id) }));

      setIsCreateOpen(true);
    } catch {
      toast.error('Failed to prepare assessment creation');
    }
  };

  const openAssignModal = async (assessment) => {
    try {
      setSelectedAssessment(assessment);
      setFormData((prev) => ({ ...prev, selectedUsers: [] }));
      await loadRespondents();
      setIsAssignOpen(true);
    } catch {
      toast.error('Failed to load respondent accounts');
    }
  };

  const handleAssignSubmit = async (event) => {
    event.preventDefault();
    if (!selectedAssessment || formData.selectedUsers.length === 0) return;
    try {
      setIsAssigning(true);
      const result = await api.post(`/assessments/${selectedAssessment.id}/assign`, {
        user_ids: formData.selectedUsers,
      });
      toast.success(result.data.message || 'Respondents assigned');
      setIsAssignOpen(false);
      setSelectedAssessment(null);
      await fetchAssessments();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign respondents');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (formData.selectedQuestions.length === 0) {
      toast.error('Please select at least one question');
      return;
    }

    try {
      setIsSaving(true);
      const res = await api.post('/assessments', {
        title: formData.title,
        description: formData.description,
        time_limit_minutes: parseInt(formData.time_limit_minutes) || null,
        max_attempts: Number(formData.max_attempts || 1),
        start_date: formData.start_date ? new Date(formData.start_date).toISOString() : null,
        end_date: formData.end_date ? new Date(formData.end_date).toISOString() : null,
        consent_required: Boolean(formData.consent_required),
        instrument_code: formData.instrument_code,
        question_ids: formData.selectedQuestions,
        assigned_user_ids: formData.selectedUsers,
      });

      if (res.data.success) {
        toast.success('Assessment created and assigned successfully!');
        setIsCreateOpen(false);
        fetchAssessments();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create assessment');
    } finally {
      setIsSaving(false);
    }
  };

  const handleInstrumentChange = async (instrumentCode) => {
    try {
      const response = await api.get(`/questions?active_only=true&instrument_code=${encodeURIComponent(instrumentCode)}`);
      const nextQuestions = response.data.data || [];
      setQuestions(nextQuestions);
      setFormData((previous) => ({
        ...previous,
        instrument_code: instrumentCode,
        selectedQuestions: nextQuestions.map((question) => question.id),
        consent_required: true,
        ...(instrumentCode === 'digcompsat-2020' && !previous.title?.includes('DigCompSAT')
          ? { title: 'DigCompSAT Self-Reflection Assessment' }
          : instrumentCode === 'dlas-thesis-v1' && previous.title === 'DigCompSAT Self-Reflection Assessment'
            ? { title: 'Digital Literacy Assessment 2026-2027' }
            : {}),
      }));
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to load the selected question bank');
    }
  };

  const openEditModal = (assessment) => {
    const toLocalValue = (value) => {
      if (!value) return '';
      const source = String(value);
      const date = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(source) ? source : `${source.replace(' ', 'T')}Z`);
      if (Number.isNaN(date.getTime())) return '';
      return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    };
    setEditingAssessment({
      ...assessment,
      time_limit_minutes: assessment.time_limit_minutes || '',
      max_attempts: assessment.max_attempts || 1,
      start_date: toLocalValue(assessment.start_date),
      end_date: toLocalValue(assessment.end_date),
    });
    setIsEditOpen(true);
  };

  const handleUpdateAssessment = async (event) => {
    event.preventDefault();
    try {
      setIsSaving(true);
      await api.put(`/assessments/${editingAssessment.id}`, {
        title: editingAssessment.title,
        description: editingAssessment.description,
        time_limit_minutes: editingAssessment.time_limit_minutes ? Number(editingAssessment.time_limit_minutes) : null,
        max_attempts: Number(editingAssessment.max_attempts || 1),
        start_date: editingAssessment.start_date ? new Date(editingAssessment.start_date).toISOString() : null,
        end_date: editingAssessment.end_date ? new Date(editingAssessment.end_date).toISOString() : null,
        status: editingAssessment.status,
      });
      toast.success('Assessment settings updated');
      setIsEditOpen(false);
      await fetchAssessments();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update assessment');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendReminders = async (assessment) => {
    if (!window.confirm(`Send an email reminder to every participant who has not completed “${assessment.title}”?`)) return;
    try {
      setRemindingId(assessment.id);
      const response = await api.post(`/assessments/${assessment.id}/remind`);
      toast.success(response.data.message || 'Reminders sent.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to send reminders. Check email settings and try again.');
    } finally {
      setRemindingId(null);
    }
  };

  const toggleSelectAllQuestions = () => {
    if (formData.instrument_code === 'digcompsat-2020') return;
    if (formData.selectedQuestions.length === questions.length) {
      setFormData({ ...formData, selectedQuestions: [] });
    } else {
      setFormData({ ...formData, selectedQuestions: questions.map((q) => q.id) });
    }
  };

  const toggleSelectAllUsers = () => {
    if (formData.selectedUsers.length === respondents.length) {
      setFormData({ ...formData, selectedUsers: [] });
    } else {
      setFormData({ ...formData, selectedUsers: respondents.map((u) => u.id) });
    }
  };

  const handleArchive = async (id) => {
    if (!window.confirm('Are you sure you want to archive this assessment?')) return;
    try {
      const res = await api.delete(`/assessments/${id}`);
      if (res.data.success) {
        toast.success('Assessment archived');
        fetchAssessments();
      }
    } catch {
      toast.error('Failed to archive assessment');
    }
  };

  const handleExport = async (id) => {
    try {
      await downloadProtectedFile(`/export/assessment/${id}/excel`, `Cohort_Report_${id}.xlsx`);
    } catch {
      toast.error('Unable to export this assessment report');
    }
  };

  const loadParticipants = async (assessmentId) => {
    const response = await api.get(`/assessments/${assessmentId}/results`);
    setParticipants(response.data.data.participants || []);
  };

  const openParticipants = async (assessment) => {
    setSelectedAssessment(assessment);
    setParticipants([]);
    setParticipantsLoading(true);
    setIsParticipantsOpen(true);
    try {
      await loadParticipants(assessment.id);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load participants');
      setIsParticipantsOpen(false);
    } finally {
      setParticipantsLoading(false);
    }
  };

  const handleReopenAttempt = async (attemptId) => {
    if (!selectedAssessment || !attemptId) return;
    try {
      setReopeningAttemptId(attemptId);
      const response = await api.post(`/attempts/${attemptId}/reopen`);
      toast.success(response.data.message || 'Attempt reopened');
      await loadParticipants(selectedAssessment.id);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not reopen this attempt');
    } finally {
      setReopeningAttemptId(null);
    }
  };

  if (loading) return <LoadingSpinner text="Loading assessments..." />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Assessments"
        description="Configure questionnaires, assign students, and review submissions."
        action={(
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex w-full items-center justify-center rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700 sm:w-auto"
          >
            <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
            Create assessment
          </button>
        )}
      />

      {/* Assessment Cards Grid */}
      <BookmarkFilter bookmarks={bookmarks} records={assessments} selected={showBookmarks} setSelected={setShowBookmarks} />
      {assessments.filter((item) => !showBookmarks || bookmarks.saved.includes(item.id)).length > 0 ? (
        <div className="research-assessment-grid">
          {assessments.filter((item) => !showBookmarks || bookmarks.saved.includes(item.id)).map((item) => {
            const statusInfo = getStatusBadge(item.status);
            return (
              <div
                key={item.id}
                className="bg-white rounded-3xl border border-slate-200/80 p-6 flex flex-col justify-between shadow-xs hover:shadow-md transition-all group"
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold ${statusInfo.bgColor} ${statusInfo.textColor}`}>
                      {statusInfo.label}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400">ID: #{item.id}</span>
                    <BookmarkButton assessment={item} bookmarks={bookmarks} />
                  </div>

                  <h3 className="text-base font-bold text-slate-900 group-hover:text-green-600 transition-colors">
                    {item.title}
                  </h3>
                  <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${item.scoring_version === 'digcompsat-self-reflection-0-3.1' ? 'bg-teal-50 text-teal-800' : 'bg-slate-100 text-slate-700'}`}>
                    {item.scoring_version === 'digcompsat-self-reflection-0-3.1' ? 'DigCompSAT · self-reflection' : 'Masbate Colleges · research questionnaire'}
                  </span>
                  <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">
                    {item.description || 'No description provided.'}
                  </p>
                  <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${item.consent_required ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                    {item.consent_required ? 'Research consent required' : 'No research consent gate'}
                  </span>

                  <div className="mt-5 space-y-2 pt-4 border-t border-slate-100 text-xs text-slate-600">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center text-slate-500">
                        <ClipboardList className="w-3.5 h-3.5 mr-1.5 text-green-500" />
                        Questions
                      </span>
                      <span className="font-bold text-slate-800">{item.question_count || 0} items</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="flex items-center text-slate-500">
                        <Users className="w-3.5 h-3.5 mr-1.5 text-green-500" />
                        Assigned Cohort
                      </span>
                      <span className="font-bold text-slate-800">{item.assigned_count || 0} students</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="flex items-center text-slate-500">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
                        Submissions
                      </span>
                      <span className="font-bold text-slate-800">{item.completed_count || 0} completed</span>
                    </div>

                    {item.time_limit_minutes && (
                      <div className="flex items-center justify-between">
                        <span className="flex items-center text-slate-500">
                          <Clock className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
                          Time Limit
                        </span>
                        <span className="font-semibold text-slate-700">{item.time_limit_minutes} mins</span>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleSendReminders(item)}
                  disabled={!item.assigned_count || remindingId === item.id}
                  className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs font-semibold text-green-800 transition-colors hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <BellRing aria-hidden="true" className="h-4 w-4" />
                  {remindingId === item.id ? 'Sending reminders…' : 'Remind unfinished participants'}
                </button>

                <div className="research-assessment-actions mt-6 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => openEditModal(item)}
                    className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:text-green-700 hover:bg-green-50 hover:border-green-200 transition-colors"
                    title="Edit assessment settings"
                    aria-label={`Edit ${item.title}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  {item.status !== 'archived' && <button
                    type="button"
                    onClick={() => openAssignModal(item)}
                    className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:text-green-700 hover:bg-green-50 hover:border-green-200 transition-colors"
                    title="Assign respondents"
                    aria-label={`Assign respondents to ${item.title}`}
                  >
                    <Users className="w-4 h-4" />
                  </button>}
                  <button
                    type="button"
                    onClick={() => openParticipants(item)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-green-200 hover:bg-green-50 hover:text-green-700"
                    aria-label={`View participants for ${item.title}`}
                    title="View participants"
                  >
                    <Users aria-hidden="true" className="h-4 w-4" />
                    <span className="hidden xl:inline">Participants</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport(item.id)}
                    className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 hover:border-emerald-200 transition-colors"
                    title="Export Cohort Excel Dataset"
                    aria-label={`Export ${item.title} cohort dataset`}
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                  </button>

                  {isAdmin && item.status !== 'archived' && (
                    <button
                      onClick={() => handleArchive(item.id)}
                      className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition-colors cursor-pointer"
                      title="Archive Assessment"
                      aria-label={`Archive ${item.title}`}
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                  )}

                  <Link
                    to={`/admin/reports`}
                    className="flex-1 inline-flex justify-center items-center py-2 px-3 rounded-xl bg-slate-900 hover:bg-green-600 text-white text-xs font-bold transition-all shadow-xs"
                  >
                    <span>View Cohort Results</span>
                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title={showBookmarks ? 'No bookmarked research assessments' : 'No assessments created'}
          description={showBookmarks ? 'Bookmark an assessment to keep it in this list.' : 'Create your first assessment to administer the DigComp 2.1 questionnaire to the freshmen cohort.'}
          actionText={showBookmarks ? 'Show all assessments' : 'Create Assessment'}
          onAction={showBookmarks ? () => setShowBookmarks(false) : openCreateModal}
        />
      )}

      {/* Create Assessment Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create & Assign Digital Literacy Assessment"
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase">Assessment Title</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase">Description / Purpose</label>
              <textarea
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase">Time Limit (Minutes)</label>
              <input
                type="number"
                min={1}
                max={180}
                value={formData.time_limit_minutes}
                onChange={(e) => setFormData({ ...formData, time_limit_minutes: e.target.value })}
                placeholder="e.g., 30 (Leave blank for no limit)"
                className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label htmlFor="assessment-max-attempts" className="block text-xs font-bold text-slate-700 uppercase">Allowed Attempts (1–10)</label>
              <input id="assessment-max-attempts" type="number" min="1" max="10" value={formData.max_attempts} onChange={(e) => setFormData({ ...formData, max_attempts: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500" />
              <p className="mt-1 text-[11px] text-slate-500">Use 1 to keep the single-attempt rule.</p>
            </div>

            <div>
              <label htmlFor="assessment-start" className="block text-xs font-bold text-slate-700 uppercase">Opens (optional)</label>
              <input
                id="assessment-start"
                type="datetime-local"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className="mt-1 w-full min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label htmlFor="assessment-end" className="block text-xs font-bold text-slate-700 uppercase">Closes (optional)</label>
              <input
                id="assessment-end"
                type="datetime-local"
                value={formData.end_date}
                min={formData.start_date || undefined}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                className="mt-1 w-full min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase">Instrument Template</label>
              <select
                value={formData.instrument_code}
                onChange={(event) => handleInstrumentChange(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="dlas-thesis-v1">Masbate Colleges research questionnaire · 30 items</option>
                <option value="digcompsat-2020">DigCompSAT self-reflection bank · 82 items</option>
              </select>
              {formData.instrument_code === 'digcompsat-2020' ? (
                <p className="mt-1 text-[11px] leading-4 text-slate-600">The full published knowledge, skills, and attitude item bank uses 0–3 response scales. Source: Clifford et al. (2020), JRC123226, European Union, CC BY 4.0. Results stay separate from thesis scores and are not locally validated; the local area mapping is not endorsed by the European Commission. <a className="font-semibold text-green-800 underline" href="https://publications.jrc.ec.europa.eu/repository/handle/JRC123226" target="_blank" rel="noreferrer">Source and methodology</a></p>
              ) : (
                <p className="mt-1 text-[11px] text-slate-500">The approved Masbate Colleges research questionnaire with its original 1–4 scale.</p>
              )}
            </div>

            <label className="sm:col-span-2 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.consent_required}
                onChange={(event) => setFormData({ ...formData, consent_required: event.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-emerald-300 text-emerald-700 focus:ring-emerald-600"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-800">Require research consent before starting</span>
                <span className="mt-0.5 block text-xs leading-5 text-slate-600">Participants must review the study information and consent before their answers can be recorded. Turn this off for assessments that are not part of this research study.</span>
              </span>
            </label>
          </div>

          {/* Question Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-slate-700 uppercase">
                Questions Selected ({formData.selectedQuestions.length} of {questions.length})
              </label>
              <button
                type="button"
                onClick={toggleSelectAllQuestions}
                disabled={formData.instrument_code === 'digcompsat-2020'}
                className="text-xs font-bold text-green-600 hover:text-green-700 cursor-pointer"
              >
                {formData.instrument_code === 'digcompsat-2020' ? 'Complete bank required' : formData.selectedQuestions.length === questions.length ? 'Deselect All' : `Select All ${questions.length} Items`}
              </button>
            </div>
            {formData.instrument_code === 'digcompsat-2020' && <p className="mt-2 text-[11px] leading-4 text-slate-500">All 82 items are required to preserve the published instrument structure. Edit or remove items only from the separate Masbate Colleges research questionnaire.</p>}
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50 divide-y divide-slate-200/60 text-xs">
              {questions.map((q) => (
                <label key={q.id} className="flex items-center py-2 cursor-pointer hover:bg-slate-100/60 px-1 rounded-md">
                  <input
                    type="checkbox"
                    checked={formData.selectedQuestions.includes(q.id)}
                    disabled={formData.instrument_code === 'digcompsat-2020'}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({ ...formData, selectedQuestions: [...formData.selectedQuestions, q.id] });
                      } else {
                        setFormData({
                          ...formData,
                          selectedQuestions: formData.selectedQuestions.filter((id) => id !== q.id),
                        });
                      }
                    }}
                    className="w-4 h-4 text-green-600 rounded border-slate-300 focus:ring-green-500 mr-2.5"
                  />
                  <span className="font-bold text-slate-600 w-10 shrink-0">#{q.question_number}</span>
                  <span className="text-slate-800 truncate">{q.question_text}</span>
                  <span className="ml-auto text-[10px] uppercase font-bold text-green-600 shrink-0 pl-2">
                    {formData.instrument_code === 'digcompsat-2020' ? `${q.area_code} · DigComp ${q.framework_competence_id || '·'} · ${q.response_type}` : q.area_code}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Respondent Assignment */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-slate-700 uppercase">
                Assign Freshmen Cohort ({formData.selectedUsers.length} of {respondents.length} selected)
              </label>
              <button
                type="button"
                onClick={toggleSelectAllUsers}
                className="text-xs font-bold text-green-600 hover:text-green-700 cursor-pointer"
              >
                {formData.selectedUsers.length === respondents.length ? 'Deselect All' : 'Assign All Enrolled'}
              </button>
            </div>
            <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50 divide-y divide-slate-200/60 text-xs">
              {respondents.map((u) => (
                <label key={u.id} className="flex items-center py-1.5 cursor-pointer hover:bg-slate-100/60 px-1 rounded-md">
                  <input
                    type="checkbox"
                    checked={formData.selectedUsers.includes(u.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({ ...formData, selectedUsers: [...formData.selectedUsers, u.id] });
                      } else {
                        setFormData({
                          ...formData,
                          selectedUsers: formData.selectedUsers.filter((id) => id !== u.id),
                        });
                      }
                    }}
                    className="w-4 h-4 text-green-600 rounded border-slate-300 focus:ring-green-500 mr-2.5"
                  />
                  <span className="font-semibold text-slate-800">
                    {u.first_name} {u.last_name}
                  </span>
                  <span className="text-slate-400 ml-2 text-[11px]">{u.email}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-bold shadow-md cursor-pointer transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Deploying…' : 'Deploy Assessment'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Assessment Settings"
        maxWidth="max-w-xl"
      >
        {editingAssessment && <form onSubmit={handleUpdateAssessment} className="space-y-4">
          <div>
            <label htmlFor="edit-assessment-title" className="block text-xs font-bold uppercase text-slate-700">Title</label>
            <input id="edit-assessment-title" required maxLength={200} value={editingAssessment.title} onChange={(event) => setEditingAssessment({ ...editingAssessment, title: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="edit-assessment-description" className="block text-xs font-bold uppercase text-slate-700">Description</label>
            <textarea id="edit-assessment-description" maxLength={2000} rows={3} value={editingAssessment.description || ''} onChange={(event) => setEditingAssessment({ ...editingAssessment, description: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-time-limit" className="block text-xs font-bold uppercase text-slate-700">Time limit (minutes)</label>
              <input id="edit-time-limit" type="number" min="1" value={editingAssessment.time_limit_minutes} onChange={(event) => setEditingAssessment({ ...editingAssessment, time_limit_minutes: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="edit-max-attempts" className="block text-xs font-bold uppercase text-slate-700">Allowed attempts (1–10)</label>
              <input id="edit-max-attempts" type="number" min="1" max="10" value={editingAssessment.max_attempts} onChange={(event) => setEditingAssessment({ ...editingAssessment, max_attempts: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="edit-assessment-status" className="block text-xs font-bold uppercase text-slate-700">Status</label>
              <select id="edit-assessment-status" value={editingAssessment.status} onChange={(event) => setEditingAssessment({ ...editingAssessment, status: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <label htmlFor="edit-assessment-start" className="block text-xs font-bold uppercase text-slate-700">Opens (optional)</label>
              <input id="edit-assessment-start" type="datetime-local" value={editingAssessment.start_date} onChange={(event) => setEditingAssessment({ ...editingAssessment, start_date: event.target.value })} className="mt-1 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs" />
            </div>
            <div>
              <label htmlFor="edit-assessment-end" className="block text-xs font-bold uppercase text-slate-700">Closes (optional)</label>
              <input id="edit-assessment-end" type="datetime-local" min={editingAssessment.start_date || undefined} value={editingAssessment.end_date} onChange={(event) => setEditingAssessment({ ...editingAssessment, end_date: event.target.value })} className="mt-1 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs" />
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setIsEditOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-600">Cancel</button>
            <button type="submit" disabled={isSaving} className="px-5 py-2.5 rounded-xl bg-green-600 text-xs font-bold text-white disabled:opacity-50">{isSaving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </form>}
      </Modal>

      <Modal
        isOpen={isAssignOpen}
        onClose={() => setIsAssignOpen(false)}
        title={`Assign respondents${selectedAssessment ? ` — ${selectedAssessment.title}` : ''}`}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleAssignSubmit} className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">Select active respondent accounts to add to this assessment.</p>
            <button
              type="button"
              onClick={toggleSelectAllUsers}
              className="shrink-0 text-xs font-bold text-green-600 hover:text-green-700"
            >
              {formData.selectedUsers.length === respondents.length ? 'Clear selection' : 'Select all'}
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50 divide-y divide-slate-200/60 text-xs">
            {respondents.map((person) => (
              <label key={person.id} className="flex items-center gap-2 py-2 px-1 rounded-md hover:bg-slate-100/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.selectedUsers.includes(person.id)}
                  onChange={(event) => setFormData((prev) => ({
                    ...prev,
                    selectedUsers: event.target.checked
                      ? [...prev.selectedUsers, person.id]
                      : prev.selectedUsers.filter((id) => id !== person.id),
                  }))}
                  className="w-4 h-4 text-green-600 rounded border-slate-300 focus:ring-green-500"
                />
                <span className="font-semibold text-slate-800">{person.first_name} {person.last_name}</span>
                <span className="text-slate-500 ml-auto truncate">{person.email}</span>
              </label>
            ))}
            {respondents.length === 0 && <p className="py-4 text-center text-slate-500">No active respondent accounts found.</p>}
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setIsAssignOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-600">Cancel</button>
            <button type="submit" disabled={isAssigning || !formData.selectedUsers.length} className="px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-bold disabled:opacity-50">
              {isAssigning ? 'Assigning…' : `Assign ${formData.selectedUsers.length} respondent${formData.selectedUsers.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isParticipantsOpen}
        onClose={() => setIsParticipantsOpen(false)}
        title={`Participants${selectedAssessment ? ` — ${selectedAssessment.title}` : ''}`}
        maxWidth="max-w-4xl"
      >
        <div className="space-y-3">
          <p className="text-sm leading-6 text-slate-600">
            Review assignment progress. If a timed attempt expires, you can restart its timer while preserving the participant’s saved answers.
          </p>
          {participantsLoading ? (
            <div role="status" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">Loading participants…</div>
          ) : participants.length ? (
            <div className="max-h-[55vh] overflow-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Participant</th>
                    <th className="px-4 py-3 font-semibold">Progress</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {participants.map((participant) => {
                    const isTimedOut = participant.attempt_status === 'in_progress'
                      && selectedAssessment?.time_limit_minutes
                      && (parseStoredDate(participant.started_at)?.getTime() ?? participantsNow)
                        + selectedAssessment.time_limit_minutes * 60_000 <= participantsNow;
                    const status = participant.attempt_status === 'completed'
                      ? 'Completed'
                      : isTimedOut ? 'Time expired'
                        : participant.attempt_status === 'in_progress' ? 'In progress' : 'Not started';
                    return (
                      <tr key={participant.user_id}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{participant.first_name} {participant.last_name}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{participant.email}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {participant.attempt_status
                            ? `${participant.answered_count || 0} answered${participant.attempt_status === 'completed' ? '' : ` · ${selectedAssessment?.question_count || 0} total`}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${isTimedOut ? 'bg-amber-50 text-amber-800' : participant.attempt_status === 'completed' ? 'bg-emerald-50 text-emerald-800' : participant.attempt_status === 'in_progress' ? 'bg-sky-50 text-sky-800' : 'bg-slate-100 text-slate-600'}`}>
                            {status}
                          </span>
                          {participant.completed_at && <p className="mt-1 text-[11px] text-slate-500">{formatDateTime(participant.completed_at)}</p>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isTimedOut && (
                            <button
                              type="button"
                              onClick={() => handleReopenAttempt(participant.attempt_id)}
                              disabled={reopeningAttemptId === participant.attempt_id}
                              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-wait disabled:opacity-60"
                            >
                              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                              {reopeningAttemptId === participant.attempt_id ? 'Reopening…' : 'Restart timer'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No participants have been assigned yet.</div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default AssessmentsManagement;

