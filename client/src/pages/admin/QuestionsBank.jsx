import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Modal from '../../components/common/Modal';
import PageHeader from '../../components/common/PageHeader';
import {
  HelpCircle,
  Plus,
  Edit,
  Database,
  MessageSquare,
  FileCode,
  ShieldCheck,
  Wrench
} from 'lucide-react';
import toast from 'react-hot-toast';

export const QuestionsBank = () => {
  const [questions, setQuestions] = useState([]);
  const [areas, setAreas] = useState([]);
  const [activeArea, setActiveArea] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [newQuestion, setNewQuestion] = useState({ competence_area_id: '', question_number: '', question_text: '', is_active: 1 });

  const areaIcons = {
    IDL: Database,
    CC: MessageSquare,
    DCC: FileCode,
    S: ShieldCheck,
    PS: Wrench,
  };

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      try {
        const [qRes, aRes] = await Promise.all([
          api.get('/questions'),
          api.get('/questions/areas'),
        ]);
        if (!active) return;
        if (qRes.data.success) setQuestions(qRes.data.data);
        if (aRes.data.success) setAreas(aRes.data.data);
      } catch {
        if (active) toast.error('Failed to load questions bank');
      } finally {
        if (active) setLoading(false);
      }
    };
    void fetchData();
    return () => { active = false; };
  }, []);

  const filteredQuestions =
    activeArea === 'ALL'
      ? questions
      : questions.filter((q) => q.area_code === activeArea);

  const openEditModal = (q) => {
    setEditingQuestion({ ...q });
    setIsEditModalOpen(true);
  };

  const openCreateModal = () => {
    const nextNumber = questions.reduce((max, question) => Math.max(max, question.question_number), 0) + 1;
    setNewQuestion({
      competence_area_id: areas[0]?.id || '',
      question_number: nextNumber,
      question_text: '',
      is_active: 1,
    });
    setIsCreateModalOpen(true);
  };

  const handleCreateSubmit = async (event) => {
    event.preventDefault();
    try {
      setIsSaving(true);
      await api.post('/questions', {
        ...newQuestion,
        competence_area_id: Number(newQuestion.competence_area_id),
        question_number: Number(newQuestion.question_number),
      });
      toast.success('Question added to the bank');
      setIsCreateModalOpen(false);
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create question');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await api.put(`/questions/${editingQuestion.id}`, {
        question_text: editingQuestion.question_text,
        is_active: editingQuestion.is_active,
      });
      if (res.data.success) {
        toast.success('Question updated successfully');
        setIsEditModalOpen(false);
        fetchData();
      }
    } catch {
      toast.error('Failed to update question');
    }
  };

  if (loading) return <LoadingSpinner text="Loading DigComp 2.1 Question Bank..." />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Masbate Colleges · Research instrument"
        title="Question bank"
        description="Review and manage the 30-item thesis questionnaire and its original 1–4 scale. The separate read-only 82-item DigCompSAT self-reflection bank is available when creating an assessment."
        action={(
          <button
            type="button"
            onClick={openCreateModal}
            disabled={!areas.length}
            className="inline-flex w-full items-center justify-center rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
            Add question
          </button>
        )}
      />

      {/* Domain Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 pb-3">
        <button
          onClick={() => setActiveArea('ALL')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeArea === 'ALL'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          All Domains ({questions.length})
        </button>

        {areas.map((a) => {
          const Icon = areaIcons[a.code] || HelpCircle;
          const isActive = activeArea === a.code;
          return (
            <button
              key={a.id}
              onClick={() => setActiveArea(a.code)}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isActive
                  ? 'bg-green-600 text-white shadow-sm shadow-green-500/20'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{a.name}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${isActive ? 'bg-green-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {a.question_count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Questions List */}
      <div className="space-y-3">
        {filteredQuestions.map((q) => {
          const Icon = areaIcons[q.area_code] || HelpCircle;
          return (
            <div
              key={q.id}
              className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-green-200 transition-all flex items-start justify-between gap-4"
            >
              <div className="flex items-start space-x-4 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-green-50 border border-green-100 text-green-700 font-extrabold flex items-center justify-center text-sm shrink-0 mt-0.5">
                  #{q.question_number}
                </div>
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-[11px] font-bold text-green-600 uppercase tracking-wider flex items-center">
                      <Icon className="w-3 h-3 mr-1" />
                      {q.area_name} ({q.area_code})
                    </span>
                    <span className={`text-[10px] px-2 py-0.2 rounded-full font-semibold ${q.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {q.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 leading-relaxed">
                    {q.question_text}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-2">
                    Evaluation Scale: 4 = Confidently & independently, 3 = Occasional difficulty, 2 = Much difficulty, 1 = Cannot do this
                  </p>
                </div>
              </div>

              <button
                onClick={() => openEditModal(q)}
                className="p-2 rounded-xl text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors shrink-0 cursor-pointer"
                title="Edit Item"
              >
                <Edit className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      {filteredQuestions.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No questions are currently in this domain.
        </div>
      )}

      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Add Question to the Bank"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <p className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            Add only items approved for this assessment instrument. Adding unvalidated questions changes its scope.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="new-question-area" className="block text-xs font-bold uppercase text-slate-700">Competence area</label>
              <select
                id="new-question-area"
                required
                value={newQuestion.competence_area_id}
                onChange={(event) => setNewQuestion({ ...newQuestion, competence_area_id: event.target.value })}
                className="mt-1 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              >
                {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="new-question-number" className="block text-xs font-bold uppercase text-slate-700">Item number</label>
              <input
                id="new-question-number"
                type="number"
                min="1"
                required
                value={newQuestion.question_number}
                onChange={(event) => setNewQuestion({ ...newQuestion, question_number: event.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label htmlFor="new-question-text" className="block text-xs font-bold uppercase text-slate-700">Competency statement</label>
            <textarea
              id="new-question-text"
              rows={4}
              maxLength={1000}
              required
              value={newQuestion.question_text}
              onChange={(event) => setNewQuestion({ ...newQuestion, question_text: event.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={newQuestion.is_active === 1}
              onChange={(event) => setNewQuestion({ ...newQuestion, is_active: event.target.checked ? 1 : 0 })}
              className="h-4 w-4 rounded border-slate-300 text-green-600"
            />
            Active in questionnaires
          </label>
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-600">Cancel</button>
            <button type="submit" disabled={isSaving} className="px-5 py-2.5 rounded-xl bg-green-600 text-xs font-bold text-white disabled:opacity-50">
              {isSaving ? 'Saving…' : 'Add Question'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Question Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit Question Item #${editingQuestion?.question_number}`}
        maxWidth="max-w-lg"
      >
        {editingQuestion && (
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase">Competence Area</label>
              <p className="text-xs font-semibold text-green-600 mt-1">
                {editingQuestion.area_name} ({editingQuestion.area_code})
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase">Question / Competency Statement</label>
              <textarea
                rows={4}
                required
                value={editingQuestion.question_text}
                onChange={(e) =>
                  setEditingQuestion({ ...editingQuestion, question_text: e.target.value })
                }
                className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500 leading-relaxed"
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="is_active_toggle"
                checked={editingQuestion.is_active === 1}
                onChange={(e) =>
                  setEditingQuestion({
                    ...editingQuestion,
                    is_active: e.target.checked ? 1 : 0,
                  })
                }
                className="w-4 h-4 text-green-600 rounded border-slate-300 focus:ring-green-500"
              />
              <label htmlFor="is_active_toggle" className="text-xs font-bold text-slate-700 cursor-pointer">
                Active in questionnaires
              </label>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-bold shadow-md cursor-pointer transition-colors"
              >
                Save Changes
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default QuestionsBank;

