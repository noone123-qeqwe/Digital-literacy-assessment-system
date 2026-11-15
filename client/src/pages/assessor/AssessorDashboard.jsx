import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import StatCard from '../../components/common/StatCard';
import PageHeader from '../../components/common/PageHeader';
import { KnowledgePulse } from '../knowledge/KnowledgeCommon';
import AreaRadarChart from '../../components/charts/AreaRadarChart';
import ProficiencyChart from '../../components/charts/ProficiencyChart';
import {
  Users,
  ClipboardList,
  CheckCircle2,
  Award,
  FileSpreadsheet
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getProficiencyLevel, formatDateTime } from '../../utils/helpers';
import { downloadProtectedFile } from '../../utils/download';
import toast from 'react-hot-toast';

export const AssessorDashboard = () => {
  const [data, setData] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const loadAssessorData = async () => {
      try {
        const [dashboard, assessmentList] = await Promise.all([
          api.get('/analytics/dashboard'),
          api.get('/assessments'),
        ]);
        if (!active) return;
        if (dashboard.data.success) setData(dashboard.data.data);
        if (assessmentList.data.success) {
          setAssessments(assessmentList.data.data);
          setSelectedAssessmentId((current) => current || String(assessmentList.data.data[0]?.id || ''));
        }
      } catch (err) {
        if (active) console.error('Failed to load assessor dashboard:', err);
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadAssessorData();
    return () => { active = false; };
  }, []);

  const handleExportRoster = async () => {
    if (!selectedAssessmentId) return;
    try {
      await downloadProtectedFile(
        `/export/assessment/${selectedAssessmentId}/excel`,
        `Cohort_Report_${selectedAssessmentId}.xlsx`
      );
    } catch {
      toast.error('Unable to export this assessment roster');
    }
  };

  if (loading) return <LoadingSpinner text="Loading teacher and assessor workspace..." />;

  const { summary, proficiencyDistribution, areaPerformance, recentSubmissions } = data || {};
  const overallLevel = getProficiencyLevel(summary?.averageScore);

  return (
    <div className="space-y-8">
      <KnowledgePulse />
      <PageHeader
        eyebrow="Teacher / assessor workspace · BSCS freshmen cohort"
        title="Assessment overview"
        description="Monitor student progress and digital literacy results across the five DigComp competence domains."
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
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

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs">
          <h3 className="text-base font-bold text-slate-900 mb-1">Proficiency Level Distribution</h3>
          <p className="text-xs text-slate-500 mb-4">Cohort breakdown based on institutional criteria</p>
          <ProficiencyChart distribution={proficiencyDistribution} />
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs">
          <h3 className="text-base font-bold text-slate-900 mb-1">Competence Domain Radar</h3>
          <p className="text-xs text-slate-500 mb-4">Mean performance across 5 DigComp areas</p>
          <AreaRadarChart areaData={areaPerformance} />
        </div>
      </div>

      {/* Submissions List */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Student Submission Roster</h3>
            <p className="text-xs text-slate-500">Live evaluation records</p>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:flex sm:items-center">
            <label className="sr-only" htmlFor="assessor-export-assessment">Assessment to export</label>
            <select
              id="assessor-export-assessment"
              value={selectedAssessmentId}
              onChange={(event) => setSelectedAssessmentId(event.target.value)}
              className="min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700 sm:max-w-56"
            >
              {assessments.map((assessment) => <option key={assessment.id} value={assessment.id}>{assessment.title}</option>)}
            </select>
            <button
              type="button"
              onClick={handleExportRoster}
              disabled={!selectedAssessmentId}
              className="inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
            >
              <FileSpreadsheet aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
              <span>Export roster</span>
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 uppercase font-semibold">
                <th className="pb-3 font-semibold">Participant</th>
                <th className="pb-3 font-semibold">Assessment Title</th>
                <th className="pb-3 font-semibold">Submitted At</th>
                <th className="pb-3 font-semibold">Overall Mean</th>
                <th className="pb-3 font-semibold">Proficiency</th>
                <th className="pb-3 font-semibold text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentSubmissions?.map((sub) => {
                const lvl = getProficiencyLevel(sub.overall_mean);
                return (
                  <tr key={sub.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 font-medium text-slate-900">
                      {sub.first_name} {sub.last_name}
                      <span className="block text-[10px] text-slate-400">{sub.email}</span>
                    </td>
                    <td className="py-3 text-slate-600">{sub.assessment_title}</td>
                    <td className="py-3 text-slate-500">{formatDateTime(sub.completed_at)}</td>
                    <td className="py-3 font-extrabold text-slate-800">{sub.overall_mean} / 4.00</td>
                    <td className="py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ${lvl.badgeColor}`}>
                        {lvl.label}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <Link
                        to={`/respondent/assessments/${sub.id}/results`}
                        className="text-green-600 hover:text-green-800 font-bold hover:underline"
                      >
                        Inspect Result
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AssessorDashboard;

