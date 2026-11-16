import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import StatCard from '../../components/common/StatCard';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import { KnowledgePulse } from '../knowledge/KnowledgeCommon';
import AreaRadarChart from '../../components/charts/AreaRadarChart';
import ProficiencyChart from '../../components/charts/ProficiencyChart';
import {
  Users,
  ClipboardList,
  CheckCircle2,
  Award,
  FileSpreadsheet,
  Search,
  RefreshCw,
  CircleAlert,
  ArrowRight,
  BarChart3,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getProficiencyLevel, formatDateTime } from '../../utils/helpers';
import { downloadProtectedFile } from '../../utils/download';
import toast from 'react-hot-toast';

export const AssessorDashboard = () => {
  const [data, setData] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [rosterSearch, setRosterSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const loadAssessorData = useCallback(async (signal) => {
    try {
      const [dashboard, assessmentList] = await Promise.all([
        api.get('/analytics/dashboard', { signal }),
        api.get('/assessments', { signal }),
      ]);
      if (signal?.aborted) return;
      setError('');
      if (dashboard.data.success) setData(dashboard.data.data);
      if (assessmentList.data.success) {
        setAssessments(assessmentList.data.data);
        setSelectedAssessmentId((current) => current || String(assessmentList.data.data[0]?.id || ''));
      }
    } catch (err) {
      if (!signal?.aborted) {
        setError(err.response?.data?.message || 'Unable to load your cohort analytics right now.');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => {
      if (!controller.signal.aborted) void loadAssessorData(controller.signal);
    });
    return () => controller.abort();
  }, [loadAssessorData]);

  const handleRefresh = () => {
    setLoading(true);
    setError('');
    void loadAssessorData();
  };

  const handleExportRoster = async () => {
    if (!selectedAssessmentId || exporting) return;
    try {
      setExporting(true);
      await downloadProtectedFile(
        `/export/assessment/${selectedAssessmentId}/excel`,
        `Cohort_Report_${selectedAssessmentId}.xlsx`
      );
      toast.success('Cohort Excel report downloaded');
    } catch {
      toast.error('Unable to export this assessment roster');
    } finally {
      setExporting(false);
    }
  };

  const { summary, proficiencyDistribution, areaPerformance, recentSubmissions } = data || {};
  const overallLevel = getProficiencyLevel(summary?.averageScore);

  const filteredSubmissions = useMemo(() => {
    const query = rosterSearch.trim().toLowerCase();
    if (!query) return recentSubmissions || [];
    return (recentSubmissions || []).filter((sub) =>
      `${sub.first_name || ''} ${sub.last_name || ''} ${sub.email || ''} ${sub.assessment_title || ''}`
        .toLowerCase()
        .includes(query)
    );
  }, [recentSubmissions, rosterSearch]);

  return (
    <div className="space-y-8">
      <KnowledgePulse />
      <PageHeader
        eyebrow="Teacher / assessor workspace · BSCS freshmen cohort"
        title="Assessment overview"
        description="Monitor student progress and digital literacy results across the five DigComp competence domains."
        action={(
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
            </button>
            <Link
              to="/admin/reports"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs transition-colors hover:bg-slate-50"
            >
              <BarChart3 aria-hidden="true" className="h-3.5 w-3.5 text-green-700" />
              <span>Research reports</span>
            </Link>
            <Link
              to="/assessor/assessments"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-green-700"
            >
              <span>Manage assessments</span>
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      />

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-900">
          <div className="flex items-center gap-3">
            <CircleAlert aria-hidden="true" className="h-5 w-5 shrink-0 text-rose-600" />
            <p>{error}</p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-100"
          >
            Try again
          </button>
        </div>
      )}

      {/* Stats */}
      {loading && !data ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4" role="status" aria-label="Loading overview statistics">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="animate-pulse rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
              <div className="h-3 w-28 rounded bg-slate-200" />
              <div className="mt-4 h-8 w-20 rounded bg-slate-200" />
              <div className="mt-3 h-3 w-32 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Monitored Students"
            value={summary?.totalParticipants || 0}
            subtitle="Enrolled respondents"
            icon={Users}
            color="brand"
          />
          <StatCard
            title="Assessments"
            value={summary?.totalAssessments || 0}
            subtitle="Active instruments"
            icon={ClipboardList}
            color="gold"
          />
          <StatCard
            title="Evaluations Completed"
            value={summary?.completedAttempts || 0}
            subtitle={`${summary?.completionRate || 0}% completed`}
            icon={CheckCircle2}
            color="emerald"
          />
          <StatCard
            title="Cohort Mean"
            value={`${summary?.averageScore || '0.00'}`}
            subtitle={`Level: ${overallLevel.label}`}
            icon={Award}
            color="amber"
          />
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs">
          <h3 className="mb-1 text-base font-bold text-slate-900">Proficiency Level Distribution</h3>
          <p className="mb-4 text-xs text-slate-500">Cohort breakdown based on institutional criteria</p>
          <ProficiencyChart distribution={proficiencyDistribution} />
        </div>

        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs">
          <h3 className="mb-1 text-base font-bold text-slate-900">Competence Domain Radar</h3>
          <p className="mb-4 text-xs text-slate-500">Mean performance across 5 DigComp areas</p>
          <AreaRadarChart areaData={areaPerformance} />
        </div>
      </div>

      {/* Submissions List */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Student Submission Roster</h3>
            <p className="text-xs text-slate-500">
              Live evaluation records{recentSubmissions?.length ? ` · ${filteredSubmissions.length} of ${recentSubmissions.length}` : ''}
            </p>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <div className="relative min-w-0 sm:w-52">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="search"
                aria-label="Filter student submissions"
                value={rosterSearch}
                onChange={(event) => setRosterSearch(event.target.value)}
                placeholder="Search student or title..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <label className="sr-only" htmlFor="assessor-export-assessment">Assessment to export</label>
            <select
              id="assessor-export-assessment"
              value={selectedAssessmentId}
              onChange={(event) => setSelectedAssessmentId(event.target.value)}
              className="min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 sm:max-w-56"
            >
              {assessments.length === 0 && <option value="">No assessments</option>}
              {assessments.map((assessment) => <option key={assessment.id} value={assessment.id}>{assessment.title}</option>)}
            </select>
            <button
              type="button"
              onClick={handleExportRoster}
              disabled={!selectedAssessmentId || exporting}
              className="inline-flex items-center justify-center rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs font-bold text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50"
            >
              <FileSpreadsheet aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
              <span>{exporting ? 'Exporting…' : 'Export roster'}</span>
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          {filteredSubmissions.length === 0 ? (
            <div className="py-4">
              <EmptyState
                title={rosterSearch ? 'No matching submissions' : 'No completed submissions yet'}
                description={
                  rosterSearch
                    ? 'Try clearing or adjusting your search query.'
                    : 'Completed DigComp self-reflection submissions from your assigned cohorts will appear here.'
                }
                actionText={rosterSearch ? 'Clear search' : undefined}
                onAction={rosterSearch ? () => setRosterSearch('') : undefined}
              />
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 font-semibold uppercase text-slate-400">
                  <th className="pb-3 font-semibold">Participant</th>
                  <th className="pb-3 font-semibold">Assessment Title</th>
                  <th className="pb-3 font-semibold">Submitted At</th>
                  <th className="pb-3 font-semibold">Overall Mean</th>
                  <th className="pb-3 font-semibold">Proficiency</th>
                  <th className="pb-3 text-right font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSubmissions.map((sub) => {
                  const lvl = getProficiencyLevel(sub.overall_mean);
                  return (
                    <tr key={sub.id} className="transition-colors hover:bg-slate-50/80">
                      <td className="py-3 font-medium text-slate-900">
                        {sub.first_name} {sub.last_name}
                        <span className="block text-[10px] text-slate-400">{sub.email}</span>
                      </td>
                      <td className="py-3 text-slate-600">{sub.assessment_title}</td>
                      <td className="py-3 text-slate-500">{formatDateTime(sub.completed_at)}</td>
                      <td className="py-3 font-extrabold text-slate-800">{sub.overall_mean} / 4.00</td>
                      <td className="py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${lvl.badgeColor}`}>
                          {lvl.label}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <Link
                          to={`/respondent/assessments/${sub.id}/results`}
                          className="font-bold text-green-600 hover:text-green-800 hover:underline"
                        >
                          Inspect Result
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default AssessorDashboard;
