import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Modal from '../../components/common/Modal';
import { useAuth } from '../../contexts/useAuth';
import AreaRadarChart from '../../components/charts/AreaRadarChart';
import {
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  ArrowLeft,
  ChevronsDown,
  Database,
  MessageSquare,
  FileCode,
  ShieldCheck,
  Wrench,
  HelpCircle,
  GraduationCap
} from 'lucide-react';
import { getProficiencyLevel, formatDateTime } from '../../utils/helpers';
import { downloadProtectedFile } from '../../utils/download';
import toast from 'react-hot-toast';

export const AssessmentResults = () => {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState('');
  const [scrollProgress, setScrollProgress] = useState(0);
  const [hasScrollableContent, setHasScrollableContent] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const fetchResults = useCallback(async () => {
    try {
      const res = await api.get(`/attempts/${attemptId}/results`);
      if (res.data.success) {
        setData(res.data.data);
      }
    } catch {
      toast.error('Failed to load assessment results');
    } finally {
      setLoading(false);
    }
  }, [attemptId]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  useEffect(() => {
    const updateScrollProgress = () => {
      const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
      setHasScrollableContent(scrollableHeight > 8);
      setScrollProgress(scrollableHeight > 8
        ? Math.min(100, Math.round((window.scrollY / scrollableHeight) * 100))
        : 0);
    };

    updateScrollProgress();
    window.addEventListener('scroll', updateScrollProgress, { passive: true });
    window.addEventListener('resize', updateScrollProgress);
    return () => {
      window.removeEventListener('scroll', updateScrollProgress);
      window.removeEventListener('resize', updateScrollProgress);
    };
  }, [data]);

  const handleExport = async (format) => {
    try {
      setExporting(format);
      await downloadProtectedFile(
        `/export/results/${attemptId}/${format}`,
        `Digital_Literacy_Result_${attemptId}.${format === 'pdf' ? 'pdf' : 'xlsx'}`
      );
    } catch {
      toast.error(`Unable to export the ${format.toUpperCase()} report`);
    } finally {
      setExporting('');
    }
  };

  const handleWithdraw = async () => {
    setWithdrawing(true);
    try {
      const response = await api.delete(`/consents/${data.attempt.assessment_id}`);
      toast.success(response.data?.message || 'Your participation was withdrawn.');
      navigate('/respondent/assessments');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to withdraw from this assessment.');
      setWithdrawing(false);
      setIsWithdrawModalOpen(false);
    }
  };

  if (loading) return <LoadingSpinner text="Computing comprehensive results..." />;

  const { attempt, areaResults, lowestRatedSkills, highestRatedSkills, recommendations } = data || {};
  const overallLevel = getProficiencyLevel(attempt?.overall_mean);

  const domainIcons = {
    IDL: Database,
    CC: MessageSquare,
    DCC: FileCode,
    S: ShieldCheck,
    PS: Wrench,
  };

  return (
    <div className="dlas-assessment-results mx-auto w-full max-w-[1600px] space-y-8 pb-12 2xl:space-y-10">
      {hasScrollableContent && (
        <div
          className="fixed bottom-0 right-0 top-16 z-40 w-1 overflow-hidden bg-slate-200/80 lg:top-[5.25rem]"
          role="progressbar"
          aria-label="Assessment report reading progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={scrollProgress}
          aria-valuetext={`${scrollProgress}% of the report viewed`}
        >
          <div className="w-full rounded-full bg-green-600 transition-[height] duration-150" style={{ height: `${scrollProgress}%` }} />
        </div>
      )}

      {/* Navigation and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link
          to="/respondent/dashboard"
          className="inline-flex min-h-11 items-center text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          <span>Back to Dashboard</span>
        </Link>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => handleExport('pdf')}
            disabled={Boolean(exporting)}
            className="inline-flex min-h-11 items-center px-4 py-2.5 rounded-xl bg-green-700 hover:bg-green-800 text-white font-bold text-sm shadow-sm transition-colors disabled:opacity-60"
          >
            <FileText className="w-4 h-4 mr-1.5" />
            <span>{exporting === 'pdf' ? 'Preparing PDF…' : 'Download PDF Report'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleExport('excel')}
            disabled={Boolean(exporting)}
            className="inline-flex min-h-11 items-center px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm shadow-sm transition-colors disabled:opacity-60"
          >
            <FileSpreadsheet className="w-4 h-4 mr-1.5" />
            <span>{exporting === 'excel' ? 'Preparing Excel…' : 'Export Excel'}</span>
          </button>
          {user?.role === 'respondent' && attempt?.consent_required && (
            <button
              type="button"
              onClick={() => setIsWithdrawModalOpen(true)}
              className="inline-flex min-h-11 items-center rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-bold text-rose-700 transition-colors hover:bg-rose-50"
            >
              Withdraw from study
            </button>
          )}
        </div>
      </div>

      {/* Main Score Hero Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-green-950 to-green-950 p-7 text-white shadow-xl sm:p-10 2xl:p-12">
        <div className="relative z-10 flex flex-col items-center justify-between gap-7 md:flex-row 2xl:gap-10">
          <div className="max-w-3xl space-y-4 text-center md:text-left">
            <div className="inline-flex items-center space-x-2 rounded-full border border-green-400/20 bg-green-500/20 px-3.5 py-1.5 text-sm font-semibold text-green-200">
              <GraduationCap className="h-4 w-4" />
              <span>Masbate Colleges • Diagnostic Evaluation Report</span>
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl 2xl:text-5xl">
              {attempt?.first_name} {attempt?.last_name}
            </h1>
            <p className="text-sm leading-6 text-slate-300 sm:text-base">
              Freshmen Diagnostic Profile • Evaluated on {formatDateTime(attempt?.completed_at)}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-sm text-slate-200 md:justify-start">
              <span className="rounded-lg bg-white/10 px-3 py-1.5 font-medium">
                {attempt?.municipality || 'Origin unspecified'}
              </span>
              <span className="rounded-lg bg-white/10 px-3 py-1.5 font-medium">
                {attempt?.senior_high_school || 'High School unspecified'} ({attempt?.shs_strand || 'Strand'})
              </span>
            </div>
          </div>

          {/* Big Circular Score */}
          <div className="flex flex-col items-center justify-center shrink-0">
            <div className="flex h-40 w-40 flex-col items-center justify-center rounded-full bg-gradient-to-tr from-green-600 to-green-500 p-1 text-center shadow-2xl ring-8 ring-white/10 sm:h-44 sm:w-44 2xl:h-48 2xl:w-48">
              <span className="text-xs font-bold uppercase tracking-widest text-green-100">
                Overall Mean
              </span>
              <span className="mt-0.5 text-5xl font-black leading-none text-white">
                {attempt?.overall_mean}
              </span>
              <span className="mt-1 text-xs text-green-100">out of 4.00</span>
            </div>

            <div className="mt-4">
              <span className={`inline-flex rounded-full px-4 py-2 text-sm font-extrabold shadow-sm ${overallLevel.badgeColor}`}>
                {attempt?.overall_level} Proficiency
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="-mt-4 flex justify-center">
        <a
          href="#domain-breakdown"
          className="group inline-flex min-h-14 items-center gap-3 rounded-full border border-green-200 bg-white px-5 py-2.5 text-left text-slate-700 shadow-sm transition hover:border-green-300 hover:bg-green-50/70 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-700 ring-1 ring-green-200 transition group-hover:bg-white">
            <ChevronsDown aria-hidden="true" className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-bold text-green-900">Scroll for more</span>
            <span className="block text-xs text-slate-500">Domain scores and recommendations below</span>
          </span>
        </a>
      </div>

      {/* Domain Breakdown Table & Radar Profile */}
      <div id="domain-breakdown" className="grid scroll-mt-28 grid-cols-1 gap-6 2xl:grid-cols-2 2xl:gap-8">
        {/* Table Breakdown */}
        <div className="flex flex-col justify-between rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs sm:p-7 2xl:p-8">
          <div>
            <div className="mb-4">
              <h3 className="text-xl font-bold text-slate-900">Competence Domain Performance</h3>
              <p className="mt-1 text-sm text-slate-600">
                Mean rating and dispersion across the 5 DigComp 2.1 areas
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-bold">
                    <th className="px-4 py-3">Domain</th>
                    <th className="px-4 py-3 text-center">Mean</th>
                    <th className="px-4 py-3 text-center">SD</th>
                    <th className="px-4 py-3 text-right">Proficiency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {areaResults?.map((area) => {
                    const Icon = domainIcons[area.area_code] || HelpCircle;
                    const lvl = getProficiencyLevel(area.weighted_mean);
                    return (
                      <tr key={area.competence_area_id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-4">
                          <div className="flex items-center space-x-2">
                            <Icon className="h-4 w-4 shrink-0 text-green-600" />
                            <span className="font-bold text-slate-800">{area.area_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center font-extrabold text-slate-900">
                          {area.weighted_mean}
                        </td>
                        <td className="px-4 py-4 text-center font-mono text-slate-500">
                          {area.standard_deviation}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${lvl.badgeColor}`}>
                            {area.level}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
            <span>Scale: 1.00–1.75 Low</span>
            <span>1.76–2.50 Moderate</span>
            <span>2.51–3.25 High</span>
            <span>3.26–4.00 Very High</span>
          </div>
        </div>

        {/* Radar Profile */}
        <div className="flex flex-col justify-between rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs sm:p-7 2xl:p-8">
          <div className="mb-2">
            <h3 className="text-xl font-bold text-slate-900">Digital Competence Radar</h3>
            <p className="mt-1 text-sm text-slate-600">Multi-axis visual map of strengths and areas for growth</p>
          </div>

          <AreaRadarChart areaData={areaResults} />

          <p className="mt-2 text-center text-sm text-slate-500">
            Higher values indicate greater independence and confidence in that digital domain.
          </p>
        </div>
      </div>

      {/* Strengths & Weaknesses (Training Needs) */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 2xl:gap-8">
        {/* Strengths */}
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs sm:p-7 2xl:p-8">
          <div className="flex items-center space-x-2 mb-4">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            <h3 className="text-xl font-bold text-slate-900">Key Digital Strengths</h3>
          </div>

          <div className="space-y-3">
            {highestRatedSkills?.map((item) => (
              <div key={item.question_id} className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 text-sm">
                <div className="flex items-center justify-between font-bold text-emerald-900 mb-1">
                  <span>{item.area_name}</span>
                  <span className="text-emerald-700">Rating {item.rating} / 4</span>
                </div>
                <p className="text-slate-700">{item.question_text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Priority Improvement Areas */}
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs sm:p-7 2xl:p-8">
          <div className="flex items-center space-x-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h3 className="text-xl font-bold text-slate-900">Identified Priority Training Needs</h3>
          </div>

          <div className="space-y-3">
            {lowestRatedSkills?.map((item) => (
              <div key={item.question_id} className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 text-sm">
                <div className="flex items-center justify-between font-bold text-amber-900 mb-1">
                  <span>{item.area_name}</span>
                  <span className="text-amber-700">Rating {item.rating} / 4</span>
                </div>
                <p className="text-slate-700">{item.question_text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Targeted Recommendations (Proposed Enhancement Program Link) */}
      <div className="space-y-5 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs sm:p-8 2xl:p-10">
        <div className="flex items-center space-x-2 pb-3 border-b border-slate-100">
          <BookOpen className="w-5 h-5 text-green-600" />
          <div>
            <h3 className="text-xl font-bold text-slate-900">
              Targeted Action Plan & Recommended Interventions
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Personalized bridging activities aligned with the proposed Digital Literacy Enhancement Program.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:gap-5">
          {recommendations?.map((rec, idx) => (
            <div key={idx} className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-green-600 uppercase tracking-wider">{rec.area}</span>
                <span className="text-xs font-semibold text-slate-500">{rec.topic}</span>
              </div>
              <p className="text-slate-700 leading-relaxed font-medium">{rec.recommendation}</p>
            </div>
          ))}
        </div>
      </div>

      <Modal isOpen={isWithdrawModalOpen} onClose={() => setIsWithdrawModalOpen(false)} title="Withdraw from this study" maxWidth="max-w-md">
        <div className="space-y-4">
          <p className="text-sm leading-6 text-slate-600">You may stop participating without penalty. Withdrawal deletes your saved answers and score for this assessment. Your shared study profile is also deleted if no other consented assessment uses it. Encrypted backup copies may remain until their scheduled expiry.</p>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setIsWithdrawModalOpen(false)} className="min-h-11 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Keep my results</button>
            <button type="button" onClick={handleWithdraw} disabled={withdrawing} className="min-h-11 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-800 disabled:opacity-60">{withdrawing ? 'Withdrawing…' : 'Withdraw and delete answers'}</button>
          </div>
        </div>
      </Modal>

    </div>
  );
};

export default AssessmentResults;

