import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Badge from '../../components/common/Badge';
import PageHeader from '../../components/common/PageHeader';
import {
  BarChart3,
  FileSpreadsheet,
  BookOpen,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import { downloadProtectedFile } from '../../utils/download';
import { useAuth } from '../../contexts/useAuth';

export const ReportsAnalytics = () => {
  const { isAdmin } = useAuth();
  const [demographics, setDemographics] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [competenceMatrix, setCompetenceMatrix] = useState([]);
  const [inferentialData, setInferentialData] = useState(null);
  const [reliabilityData, setReliabilityData] = useState(null);
  const [desiredSkillsResponses, setDesiredSkillsResponses] = useState([]);
  const [desiredSkillsMeta, setDesiredSkillsMeta] = useState({ pendingReviewCount: 0, suppressedForSmallCohort: false, minimumReportGroupSize: 5 });
  const [privacyReviewQueue, setPrivacyReviewQueue] = useState([]);
  const [privacyReviewAssessmentId, setPrivacyReviewAssessmentId] = useState('');
  const [reviewDrafts, setReviewDrafts] = useState({});
  const [reviewConfirmations, setReviewConfirmations] = useState({});
  const [reviewSavingId, setReviewSavingId] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const [assessmentsLoaded, setAssessmentsLoaded] = useState(false);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [analyticsAssessmentId, setAnalyticsAssessmentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('tables'); // 'tables', 'enhancement', 'matrix'
  const visiblePrivacyReviewQueue = isAdmin && privacyReviewAssessmentId === analyticsAssessmentId
    ? privacyReviewQueue
    : [];

  useEffect(() => {
    let active = true;
    api.get('/assessments')
      .then((assessmentRes) => {
        if (!active) return;
        if (assessmentRes.data.success) {
          const list = assessmentRes.data.data || [];
          setAssessments(list);
          const firstId = list[0]?.id ? String(list[0].id) : '';
          if (firstId) {
            setSelectedAssessmentId((current) => current || firstId);
            setAnalyticsAssessmentId((current) => current || firstId);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setAssessmentsLoaded(true);
      });
    return () => { active = false; };
  }, []);

  const fetchReports = useCallback(async (signal) => {
    try {
      const query = analyticsAssessmentId
        ? { params: { assessment_id: analyticsAssessmentId }, ...(signal ? { signal } : {}) }
        : signal ? { signal } : undefined;
      const [demoRes, dashRes, matrixRes, inferentialRes, desiredSkillsRes] = await Promise.all([
        api.get('/analytics/demographics', query),
        api.get('/analytics/dashboard', query),
        api.get('/analytics/competence-matrix', query),
        api.get('/analytics/inferential', query),
        api.get('/analytics/desired-skills', query),
      ]);
      if (signal?.aborted) return;

      if (demoRes.data.success) setDemographics(demoRes.data.data);
      if (dashRes.data.success) setDashboardData(dashRes.data.data);
      if (matrixRes.data.success) setCompetenceMatrix(matrixRes.data.data);
      if (inferentialRes.data.success) setInferentialData(inferentialRes.data.data);
      if (desiredSkillsRes.data.success) {
        setDesiredSkillsResponses(desiredSkillsRes.data.data);
        setDesiredSkillsMeta({
          pendingReviewCount: desiredSkillsRes.data.pendingReviewCount || 0,
          suppressedForSmallCohort: Boolean(desiredSkillsRes.data.suppressedForSmallCohort),
          minimumReportGroupSize: desiredSkillsRes.data.minimumReportGroupSize || 5,
        });
      }
    } catch {
      if (!signal?.aborted) toast.error('Failed to load analytical reports');
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setAnalyticsLoading(false);
      }
    }
  }, [analyticsAssessmentId]);

  useEffect(() => {
    if (!assessmentsLoaded) return undefined;
    const controller = new AbortController();
    Promise.resolve().then(() => {
      if (!controller.signal.aborted) void fetchReports(controller.signal);
    });
    return () => controller.abort();
  }, [assessmentsLoaded, fetchReports]);

  useEffect(() => {
    if (!analyticsAssessmentId) return undefined;
    let active = true;
    api.get('/analytics/reliability', { params: { assessment_id: analyticsAssessmentId } })
      .then((response) => { if (active) setReliabilityData(response.data.data); })
      .catch(() => { if (active) setReliabilityData(null); });
    return () => { active = false; };
  }, [analyticsAssessmentId]);

  useEffect(() => {
    if (!isAdmin || !analyticsAssessmentId) {
      return undefined;
    }
    let active = true;
    api.get('/analytics/desired-skills/review-queue', { params: { assessment_id: analyticsAssessmentId } })
      .then((response) => {
        if (!active) return;
        const queue = response.data.data || [];
        setPrivacyReviewQueue(queue);
        setPrivacyReviewAssessmentId(analyticsAssessmentId);
        setReviewDrafts((current) => Object.fromEntries(queue.map((item) => [item.attempt_id, current[item.attempt_id] ?? item.raw_response])));
      })
      .catch(() => {
        if (!active) return;
        setPrivacyReviewQueue([]);
        setPrivacyReviewAssessmentId(analyticsAssessmentId);
      });
    return () => { active = false; };
  }, [analyticsAssessmentId, isAdmin]);

  const savePrivacyReview = async (attemptId) => {
    setReviewSavingId(attemptId);
    try {
      const response = await api.put(`/analytics/desired-skills/${attemptId}/review`, { redacted_response: reviewDrafts[attemptId] || '' });
      toast.success(response.data.message);
      setReviewConfirmations((current) => ({ ...current, [attemptId]: false }));
      await fetchReports();
      const queueResponse = await api.get('/analytics/desired-skills/review-queue', { params: { assessment_id: analyticsAssessmentId } });
      setPrivacyReviewQueue(queueResponse.data.data || []);
      setPrivacyReviewAssessmentId(analyticsAssessmentId);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to save the privacy review.');
    } finally {
      setReviewSavingId(null);
    }
  };

  const exportAssessment = async () => {
    if (!selectedAssessmentId) return;
    try {
      await downloadProtectedFile(
        `/export/assessment/${selectedAssessmentId}/excel`,
        `Deidentified_Study_Data_${selectedAssessmentId}.xlsx`
      );
    } catch {
      toast.error('Unable to export this assessment report');
    }
  };

  if (loading) return <LoadingSpinner text="Loading cohort summaries..." />;

  const { areaPerformance, summary } = dashboardData || {};
  const activeAnalyticsAssessment = assessments.find((assessment) => String(assessment.id) === analyticsAssessmentId);
  const isDigCompSat = activeAnalyticsAssessment?.scoring_version === 'digcompsat-self-reflection-0-3.1';
  const scoreScaleMax = Number(dashboardData?.scoreScaleMax) === 3 ? 3 : 4;
  const selectedExportAssessment = assessments.find((assessment) => String(assessment.id) === selectedAssessmentId);
  const selectedExportIsDigCompSat = selectedExportAssessment?.scoring_version === 'digcompsat-self-reflection-0-3.1';
  const profileGroupRows = [
    ['Sex', demographics?.bySex],
    ['Age', demographics?.byAge],
    ['Municipality', demographics?.byMunicipality],
    ['Municipality group', demographics?.byMunicipalityGroup],
    ['Junior high school type', demographics?.byJuniorSchoolType],
    ['Senior high school type', demographics?.bySeniorSchoolType],
    ['Home computer', demographics?.byHomeAccess],
    ['Home computer and internet access', demographics?.byPcInternet],
    ['Home internet access', demographics?.byInternetAccess],
    ['Family income', demographics?.byIncome],
    ['Senior high school strand', demographics?.byStrand],
  ].flatMap(([label, groups]) => (groups || []).map((group) => ({ label, ...group })));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Research and reporting"
        title="Cohort analytics"
        description="Explore descriptive cohort summaries, demographics, competence profiles, and training priorities."
        action={(
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <Link
            to={isAdmin ? '/admin/analytics' : '/assessor/analytics'}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:border-green-200 hover:bg-green-50 hover:text-green-700 sm:w-auto"
          >
            <span>Knowledge reports</span>
            <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
          <label className="sr-only" htmlFor="report-assessment">Assessment to export</label>
          <select
            id="report-assessment"
            value={selectedAssessmentId}
            onChange={(event) => setSelectedAssessmentId(event.target.value)}
            className="min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 sm:w-auto"
          >
            {assessments.map((assessment) => (
              <option key={assessment.id} value={assessment.id}>{assessment.title}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={exportAssessment}
            disabled={!selectedAssessmentId}
            className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            <FileSpreadsheet className="w-4 h-4 mr-1.5" />
            <span>{selectedExportIsDigCompSat ? 'Export De-identified Assessment Results' : 'Export De-identified Study Data'}</span>
          </button>
          </div>
        )}
      />

      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <label htmlFor="analytics-assessment-filter" className="block text-xs font-bold text-slate-800">Filter report data</label>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {analyticsAssessmentId
              ? `Showing results for ${assessments.find((assessment) => String(assessment.id) === analyticsAssessmentId)?.title || 'the selected assessment'}.`
              : 'Showing results across all assessments in your cohort.'}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            id="analytics-assessment-filter"
            value={analyticsAssessmentId}
            onChange={(event) => {
              setAnalyticsLoading(true);
              setAnalyticsAssessmentId(event.target.value);
            }}
            className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 sm:min-w-64"
          >
            <option value="">All assessments</option>
            {assessments.map((assessment) => (
              <option key={assessment.id} value={String(assessment.id)}>{assessment.title}</option>
            ))}
          </select>
          {analyticsLoading && <span role="status" className="text-xs text-slate-500">Updating summaries…</span>}
        </div>
      </div>

      {isDigCompSat && <div role="note" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
        This is the separate DigCompSAT self-reflection item bank. Scores use a 0–3 scale and summarize self-reported knowledge, skills, and attitudes. This version has not yet been locally validated with Masbate Colleges students; keep its data separate from the thesis questionnaire analysis.
      </div>}

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-slate-200/80 gap-x-6 gap-y-2 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab('tables')}
          aria-pressed={activeTab === 'tables'}
          className={`pb-3 border-b-2 transition-all cursor-pointer flex items-center space-x-1.5 ${
            activeTab === 'tables'
              ? 'border-green-600 text-green-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>{isDigCompSat ? 'Self-reflection summaries' : 'Statistical Tables (Thesis Ch. 4)'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('enhancement')}
          aria-pressed={activeTab === 'enhancement'}
          className={`pb-3 border-b-2 transition-all cursor-pointer flex items-center space-x-1.5 ${
            activeTab === 'enhancement'
              ? 'border-green-600 text-green-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Proposed Enhancement Program</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('matrix')}
          aria-pressed={activeTab === 'matrix'}
          className={`pb-3 border-b-2 transition-all cursor-pointer flex items-center space-x-1.5 ${
            activeTab === 'matrix'
              ? 'border-green-600 text-green-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>{isDigCompSat ? 'Full 82-item Self-Rating Matrix' : 'Full 30-Item Rating Matrix'}</span>
        </button>
      </div>

      {activeTab === 'tables' && (
        <div className="space-y-8">
          {/* Table 2: Level of Digital Literacy per Competence Area */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/80 shadow-xs">
            <div className="mb-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-green-600">
                {isDigCompSat ? 'DigCompSAT • Area summary' : 'Chapter 4 • Table 2'}
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-0.5">
                {isDigCompSat ? 'Self-Reported Digital Competence by Area' : 'Level of Digital Literacy of the Respondents Across Competence Areas'}
              </h3>
              <p className="text-xs text-slate-500">
                {isDigCompSat ? 'Mean self-rating and variation across areas. Higher values indicate greater self-reported capability; they are not official proficiency levels.' : 'Weighted mean, standard deviation, and descriptive proficiency level (Scale: 1.00–1.75 Low, 1.76–2.50 Moderate, 2.51–3.25 High, 3.26–4.00 Very High).'}
              </p>
            </div>

            <div className="space-y-3 sm:hidden">
              {areaPerformance?.map((area) => (
                <article key={area.code} className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-green-600">{area.code}</span>
                      <h4 className="mt-0.5 text-sm font-bold text-slate-900">{area.name}</h4>
                    </div>
                    <Badge
                      variant={
                        area.descriptive_level === 'Very High'
                          ? 'success'
                          : area.descriptive_level === 'High'
                          ? 'primary'
                          : area.descriptive_level === 'Moderate'
                          ? 'warning'
                          : area.descriptive_level === 'N/A' ? 'neutral' : 'danger'
                      }
                      size="sm"
                    >
                      {area.descriptive_level}
                    </Badge>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200/70 pt-3 text-xs">
                    <div>
                      <dt className="text-[11px] font-medium text-slate-500">{isDigCompSat ? 'Mean / 3' : 'Weighted Mean'}</dt>
                      <dd className="mt-0.5 font-extrabold text-slate-900">{area.weighted_mean ?? 'N/A'}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-medium text-slate-500">Std. Dev.</dt>
                      <dd className="mt-0.5 font-mono text-slate-700">{area.sd ?? 'N/A'}</dd>
                    </div>
                  </dl>
                </article>
              ))}
              <article className="rounded-2xl border-2 border-green-200 bg-green-50/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-green-800">
                    {isDigCompSat ? 'Overall Mean Self-Rating' : 'Composite Overall Digital Literacy'}
                  </h4>
                  <span className="inline-flex rounded-full bg-green-600 px-3 py-1 text-xs font-extrabold text-white shadow-xs">
                    {isDigCompSat
                      ? (summary?.scoredAttempts ? 'Self-reflection' : 'N/A')
                      : !summary?.scoredAttempts
                      ? 'N/A'
                      : summary.averageScore >= 3.26
                      ? 'Very High'
                      : summary?.averageScore >= 2.51
                      ? 'High'
                      : summary?.averageScore >= 1.76
                      ? 'Moderate'
                      : 'Low'}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-green-200/80 pt-3 text-xs">
                  <div>
                    <dt className="text-[11px] font-medium text-green-800/80">{isDigCompSat ? 'Overall Mean / 3' : 'Overall Weighted Mean'}</dt>
                    <dd className="mt-0.5 text-sm font-extrabold text-green-900">{summary?.scoredAttempts ? summary.averageScore : 'N/A'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium text-green-800/80">Std. Dev.</dt>
                    <dd className="mt-0.5 font-mono font-semibold text-slate-700">{summary?.scoredAttempts ? summary.standardDeviation : 'N/A'}</dd>
                  </div>
                </dl>
              </article>
            </div>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-bold">
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Competence Area (DigComp 2.1)</th>
                    <th className="py-3 px-4 text-center">{isDigCompSat ? 'Mean / 3' : 'Weighted Mean'}</th>
                    <th className="py-3 px-4 text-center">Std. Dev.</th>
                    <th className="py-3 px-4 text-center">{isDigCompSat ? 'Interpretation' : 'Descriptive Level'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {areaPerformance?.map((area) => (
                    <tr key={area.code} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4 font-bold text-green-600">{area.code}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{area.name}</td>
                      <td className="py-3 px-4 text-center font-extrabold text-slate-900">
                        {area.weighted_mean ?? 'N/A'}
                      </td>
                      <td className="py-3 px-4 text-center text-slate-500 font-mono">
                        {area.sd ?? 'N/A'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge
                          variant={
                            area.descriptive_level === 'Very High'
                              ? 'success'
                              : area.descriptive_level === 'High'
                              ? 'primary'
                              : area.descriptive_level === 'Moderate'
                              ? 'warning'
                            : area.descriptive_level === 'N/A' ? 'neutral' : 'danger'
                          }
                          size="sm"
                        >
                          {area.descriptive_level}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {/* Overall Summary Row */}
                  <tr className="bg-green-50/50 font-bold border-t-2 border-green-200">
                    <td className="py-3.5 px-4 font-extrabold text-green-800" colSpan={2}>
                      {isDigCompSat ? 'OVERALL MEAN SELF-RATING' : 'COMPOSITE OVERALL DIGITAL LITERACY'}
                    </td>
                    <td className="py-3.5 px-4 text-center text-sm font-extrabold text-green-900">
                      {summary?.scoredAttempts ? summary.averageScore : 'N/A'}
                    </td>
                    <td className="py-3.5 px-4 text-center text-slate-500 font-mono">
                      {summary?.scoredAttempts ? summary.standardDeviation : 'N/A'}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex px-3 py-1 rounded-full text-xs font-extrabold bg-green-600 text-white shadow-xs">
                        {isDigCompSat
                          ? (summary?.scoredAttempts ? 'Self-reflection' : 'N/A')
                          : !summary?.scoredAttempts
                          ? 'N/A'
                          : summary.averageScore >= 3.26
                          ? 'Very High'
                          : summary?.averageScore >= 2.51
                          ? 'High'
                          : summary?.averageScore >= 1.76
                          ? 'Moderate'
                          : 'Low'}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <section className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs sm:p-7">
            <div className="mb-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-green-700">Instrument quality · Pilot analysis</span>
              <h3 className="mt-1 text-base font-bold text-slate-900">Questionnaire reliability (Cronbach’s alpha)</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">{isDigCompSat ? 'Calculated from complete self-reflection responses for this version only. Treat as exploratory and review its suitability for the three response dimensions before interpreting.' : 'Calculated from completed answers for the selected assessment. Review interpretation with the approved thesis adviser.'}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-green-800">Overall scale</p>
                <p className="mt-2 text-3xl font-extrabold text-slate-950">{reliabilityData?.overall?.alpha ?? '—'}</p>
                <p className="mt-1 text-xs text-slate-600">{reliabilityData?.overall?.sampleSize ?? 0} complete responses · {reliabilityData?.overall?.itemCount ?? 0} items</p>
              </div>
              {(reliabilityData?.areas || []).map((area) => (
                <div key={area.code} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-600">{area.name}</p>
                  <p className="mt-2 text-2xl font-extrabold text-slate-950">{area.alpha ?? '—'}</p>
                  <p className="mt-1 text-xs text-slate-500">n={area.sampleSize} · {area.itemCount} items</p>
                </div>
              ))}
            </div>
            {reliabilityData?.interpretation && <p className="mt-4 text-[11px] leading-5 text-slate-500">{reliabilityData.interpretation}</p>}
          </section>

          {/* Live profile summaries; inferential tests require the approved study method. */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/80 shadow-xs">
            <div className="mb-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-green-600">
                Live respondent profile
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-0.5">
                {isDigCompSat ? 'Self-reflection results by profile group' : 'Digital literacy results by profile group'}
              </h3>
              <p className="text-xs text-slate-500">
                Group counts and mean scores reflect completed assessment attempts. Categories with fewer than five respondents are withheld to reduce re-identification risk.
              </p>
            </div>

            <div className="space-y-2.5 sm:hidden">
              {profileGroupRows.map((group) => (
                <article key={`${group.label}-${group.category}`} className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{group.label}</p>
                      <h4 className="mt-0.5 text-sm font-semibold text-slate-900">{group.category}</h4>
                    </div>
                    <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                      n={group.respondent_count}
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between border-t border-slate-200/70 pt-2 text-xs">
                    <span className="text-slate-500">Mean score / {scoreScaleMax}</span>
                    <span className="font-mono font-bold text-slate-900">{group.mean_score ?? 'N/A'}</span>
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-bold">
                    <th className="py-3 px-4">Profile Variable</th>
                    <th className="py-3 px-4">Group</th>
                    <th className="py-3 px-4 text-center">Respondents</th>
                    <th className="py-3 px-4 text-center">Mean score / {scoreScaleMax}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {profileGroupRows.map((group) => (
                    <tr key={`${group.label}-${group.category}`} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4 font-semibold text-slate-900">{group.label}</td>
                      <td className="py-3 px-4 text-slate-600">{group.category}</td>
                      <td className="py-3 px-4 text-center">{group.respondent_count}</td>
                      <td className="py-3 px-4 text-center font-mono">{group.mean_score ?? 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {!isDigCompSat && <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs sm:p-7">
            <div className="mb-5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-green-700">{isDigCompSat ? 'Exploratory · Profile comparisons' : 'Chapter 4 · Profile comparisons'}</span>
              <h3 className="mt-1 text-base font-bold text-slate-900">{isDigCompSat ? 'Self-reflection comparisons at α = 0.05' : 'Inferential analysis at α = 0.05'}</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {isDigCompSat ? 'These exploratory tests use this instrument’s 0–3 self-reflection scores only; they are not combined with the thesis questionnaire and should not be treated as locally validated findings. Normality and equal-variance checks, effect sizes, confidence intervals, and multiple-comparison adjustments are shown where available. Groups with fewer than five respondents are suppressed.' : 'Normality is checked with Jarque–Bera and equal variance with median-centered Levene. Tests report effect sizes, 95% confidence intervals where appropriate, and Benjamini–Hochberg adjusted q-values across profile comparisons. Groups with fewer than five respondents are excluded and suppressed.'}
              </p>
            </div>
            <div className="space-y-3 sm:hidden">
              {(inferentialData?.comparisons || []).map((comparison) => (
                <article key={comparison.variable} className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 text-xs">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{comparison.label}</h4>
                      <p className="mt-0.5 text-[11px] text-slate-600">{comparison.method}</p>
                    </div>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        comparison.decisionAdjusted?.startsWith('Reject')
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-slate-200/80 text-slate-700'
                      }`}
                    >
                      {comparison.decisionAdjusted || comparison.decision}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 border-y border-slate-200/70 py-2.5 text-[11px]">
                    <div>
                      <dt className="text-slate-500">Statistic</dt>
                      <dd className="mt-0.5 font-mono font-bold text-slate-900">{comparison.statistic ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">df</dt>
                      <dd className="mt-0.5 font-mono font-semibold text-slate-800">{comparison.degreesFreedom ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">p / q-value</dt>
                      <dd className="mt-0.5 font-mono font-semibold text-slate-800">{comparison.pValue ?? '—'} / {comparison.pValueAdjusted ?? '—'}</dd>
                    </div>
                  </dl>
                  <div className="mt-2.5 space-y-1.5 text-[11px] leading-5 text-slate-600">
                    <p>{comparison.groups.map((group) => `${group.label}: n=${group.sampleSize}, mean=${group.mean ?? '—'}${group.confidenceInterval95 ? `, 95% CI ${group.confidenceInterval95.lower}–${group.confidenceInterval95.upper}` : ''}`).join(' · ')}</p>
                    {comparison.effectSize && (
                      <p className="font-semibold text-slate-700">
                        Effect size: {comparison.effectSize.name} {comparison.effectSize.value}
                        {comparison.effectSizeConfidenceInterval95 ? `; 95% bootstrap CI ${comparison.effectSizeConfidenceInterval95.lower}–${comparison.effectSizeConfidenceInterval95.upper}` : ''}
                        {comparison.confidenceInterval95 ? `; mean difference 95% CI ${comparison.confidenceInterval95.lower}–${comparison.confidenceInterval95.upper}` : ''}.
                      </p>
                    )}
                    {comparison.postHoc?.length > 0 && (
                      <details className="pt-1">
                        <summary className="cursor-pointer font-semibold text-green-800">Tukey HSD pairwise comparisons</summary>
                        <div className="mt-1.5 grid gap-1">
                          {comparison.postHoc.map((pair) => (
                            <span key={`${pair.groupA}-${pair.groupB}`} className={pair.significant ? 'font-semibold text-rose-700' : ''}>
                              {pair.groupA} vs {pair.groupB}: Δ={pair.meanDifference}, p={pair.pValue}{pair.significant ? ' · significant' : ''}
                            </span>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-600">
                    <th className="px-3 py-3">Profile variable</th>
                    <th className="px-3 py-3">Test</th>
                    <th className="px-3 py-3 text-center">Statistic</th>
                    <th className="px-3 py-3 text-center">df</th>
                    <th className="px-3 py-3 text-center">p / q-value</th>
                    <th className="px-3 py-3">Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(inferentialData?.comparisons || []).map((comparison) => (
                    <React.Fragment key={comparison.variable}>
                      <tr className="align-top hover:bg-slate-50/60">
                        <td className="px-3 py-3 font-semibold text-slate-900">{comparison.label}</td>
                        <td className="px-3 py-3 text-slate-600">{comparison.method}</td>
                        <td className="px-3 py-3 text-center font-mono">{comparison.statistic ?? '—'}</td>
                        <td className="px-3 py-3 text-center font-mono">{comparison.degreesFreedom ?? '—'}</td>
                        <td className="px-3 py-3 text-center font-mono">{comparison.pValue ?? '—'} / {comparison.pValueAdjusted ?? '—'}</td>
                        <td className={`px-3 py-3 font-semibold ${comparison.decisionAdjusted?.startsWith('Reject') ? 'text-rose-700' : 'text-slate-700'}`}>{comparison.decisionAdjusted || comparison.decision}</td>
                      </tr>
                      <tr className="bg-slate-50/50">
                        <td colSpan={6} className="px-3 pb-3 pt-1 text-[11px] leading-5 text-slate-500">
                          <span>{comparison.groups.map((group) => `${group.label}: n=${group.sampleSize}, mean=${group.mean ?? '—'}${group.confidenceInterval95 ? `, 95% CI ${group.confidenceInterval95.lower}–${group.confidenceInterval95.upper}` : ''}`).join(' · ')}</span>
                          {comparison.effectSize && <span className="ml-2 font-semibold text-slate-700">Effect size: {comparison.effectSize.name} {comparison.effectSize.value}{comparison.effectSizeConfidenceInterval95 ? `; 95% bootstrap CI ${comparison.effectSizeConfidenceInterval95.lower}–${comparison.effectSizeConfidenceInterval95.upper}` : ''}{comparison.confidenceInterval95 ? `; mean difference 95% CI ${comparison.confidenceInterval95.lower}–${comparison.confidenceInterval95.upper}` : ''}.</span>}
                          {comparison.equalVariance && <span className="ml-2">{comparison.equalVariance.method} p={comparison.equalVariance.pValue}</span>}
                          {comparison.normality?.length > 0 && <span className="ml-2">Normality: {comparison.normality.map((check) => `${check.group} ${check.checked ? `p=${check.pValue}` : 'not assessed (small n)'}`).join('; ')}</span>}
                          {comparison.suppressedSmallGroups && <span className="ml-2">One or more small groups were suppressed (minimum n={comparison.minimumGroupSize}).</span>}
                          {comparison.postHoc?.length > 0 && (
                            <details className="mt-2">
                              <summary className="cursor-pointer font-semibold text-green-800">Tukey HSD pairwise comparisons</summary>
                              <div className="mt-2 grid gap-1 sm:grid-cols-2">
                                {comparison.postHoc.map((pair) => <span key={`${pair.groupA}-${pair.groupB}`} className={pair.significant ? 'font-semibold text-rose-700' : ''}>{pair.groupA} vs {pair.groupB}: Δ={pair.meanDifference}, p={pair.pValue}{pair.significant ? ' · significant' : ''}</span>)}
                              </div>
                            </details>
                          )}
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-[11px] leading-5 text-slate-500">{inferentialData?.note} Completed responses analyzed: {inferentialData?.observationCount ?? 0}.</p>
          </div>}

          {visiblePrivacyReviewQueue.length > 0 && (
            <section className="rounded-3xl border border-amber-300 bg-amber-50/80 p-6 shadow-xs sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Privacy review · Admin only</span>
                  <h3 className="mt-1 text-base font-bold text-slate-950">Review open-ended responses</h3>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-700">Raw responses are withheld from reports and exports until you remove names, contact details, and other identifying information. Clear a response to keep it out of reporting.</p>
                </div>
                <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-bold text-amber-950">{visiblePrivacyReviewQueue.length} pending</span>
              </div>
              <div className="mt-5 space-y-4">
                {visiblePrivacyReviewQueue.map((item) => (
                  <article key={item.attempt_id} className="rounded-2xl border border-amber-200 bg-white p-4">
                    <p className="mb-2 text-xs font-semibold text-slate-600">{item.assessment_title} · {item.completed_at ? new Date(`${String(item.completed_at).replace(' ', 'T')}Z`).toLocaleDateString() : 'Date unavailable'}</p>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div>
                        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Original response · restricted view</p>
                        <p className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">{item.raw_response}</p>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500" htmlFor={`redacted-response-${item.attempt_id}`}>Sanitized response for reporting</label>
                        <textarea id={`redacted-response-${item.attempt_id}`} maxLength={1200} rows={4} value={reviewDrafts[item.attempt_id] ?? ''} onChange={(event) => setReviewDrafts((current) => ({ ...current, [item.attempt_id]: event.target.value }))} className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm leading-6 text-slate-900 outline-none focus:border-green-700 focus:ring-4 focus:ring-green-700/10" />
                        <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-600">
                          <input type="checkbox" checked={Boolean(reviewConfirmations[item.attempt_id])} onChange={(event) => setReviewConfirmations((current) => ({ ...current, [item.attempt_id]: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-green-700" />
                          <span>I reviewed the text and removed details that could identify the respondent or another person.</span>
                        </label>
                        <button type="button" disabled={!reviewConfirmations[item.attempt_id] || reviewSavingId === item.attempt_id} onClick={() => savePrivacyReview(item.attempt_id)} className="mt-3 min-h-10 rounded-xl bg-green-800 px-4 text-sm font-semibold text-white hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-50">{reviewSavingId === item.attempt_id ? 'Saving…' : 'Save sanitized response'}</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {!isDigCompSat && <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs sm:p-7">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-sky-700">Chapter 4 · Part III</span>
                <h3 className="mt-1 text-base font-bold text-slate-900">Skills respondents want to develop</h3>
              </div>
              <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">{desiredSkillsResponses.length} reviewed · {desiredSkillsMeta.pendingReviewCount} pending</span>
            </div>
            {desiredSkillsResponses.length ? (
              <div className="space-y-3">
                {desiredSkillsResponses.map((answer) => (
                  <article key={answer.respondent_code} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                      <span className="font-bold text-slate-700">{answer.respondent_code}</span>
                      <span className="text-slate-500">{answer.completed_at ? new Date(`${String(answer.completed_at).replace(' ', 'T')}Z`).toLocaleDateString() : ''}</span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{answer.response}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">{desiredSkillsMeta.suppressedForSmallCohort ? `Free-text reporting is suppressed until at least ${desiredSkillsMeta.minimumReportGroupSize} completed participants are available.` : desiredSkillsMeta.pendingReviewCount > 0 ? 'Submitted responses remain withheld until an administrator removes identifying details and approves them.' : 'No reviewed open-ended responses are available for this cohort yet.'}</p>
            )}
          </div>}
        </div>
      )}

      {activeTab === 'enhancement' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-green-900 to-green-950 rounded-3xl p-6 sm:p-8 text-white">
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              Proposed Digital Literacy Enhancement Program (DLEP)
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed max-w-3xl">
              {isDigCompSat ? 'A proposed learning-program outline. Review local assessment findings and approve the learning content before treating these modules as recommendations for Masbate Colleges students.' : 'A structured semester-long intervention formulated on the basis of empirical assessment results from Computer Science freshmen at Masbate Colleges, targeting the lowest-ranked competencies through hands-on laboratory workshops and peer coaching.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Module 1 */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-green-100 text-green-800 uppercase">
                    Module 1
                  </span>
                  <span className="text-xs text-slate-400 font-medium">Weeks 1–4</span>
                </div>
                <h3 className="text-base font-bold text-slate-900">Academic Information & Data Skills</h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Focuses on advanced online searching techniques, Boolean operators, scholarly source verification, structured bookmarking, and safe data extraction from forms.
                </p>
                <div className="mt-4 space-y-1.5 text-xs text-slate-700">
                  <p className="font-semibold text-slate-900">Target Competencies:</p>
                  <ul className="list-disc list-inside text-slate-600 space-y-1 pl-1">
                    <li>Advanced Google/IEEE/ACM Boolean search filters</li>
                    <li>CRAAP Test for digital source credibility assessment</li>
                    <li>Systematic cloud directory file structures and backup</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Module 2 */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 uppercase">
                    Module 2
                  </span>
                  <span className="text-xs text-slate-400 font-medium">Weeks 5–8</span>
                </div>
                <h3 className="text-base font-bold text-slate-900">Productivity & Content Creation</h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Advanced spreadsheet data handling (Excel/Sheets), academic documentation in Word, LaTeX basics, citation management (APA 7th), and copyright ethics.
                </p>
                <div className="mt-4 space-y-1.5 text-xs text-slate-700">
                  <p className="font-semibold text-slate-900">Target Competencies:</p>
                  <ul className="list-disc list-inside text-slate-600 space-y-1 pl-1">
                    <li>Formulas, pivot tables, and charting in spreadsheets</li>
                    <li>Technical report formatting and automated bibliographies</li>
                    <li>Creative Commons licensing and anti-plagiarism awareness</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Module 3 */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 uppercase">
                    Module 3
                  </span>
                  <span className="text-xs text-slate-400 font-medium">Weeks 9–12</span>
                </div>
                <h3 className="text-base font-bold text-slate-900">Digital Safety, Security & Privacy</h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Cyber hygiene, password managers, multi-factor authentication (MFA), phishing detection, device endpoint protection, and digital well-being.
                </p>
                <div className="mt-4 space-y-1.5 text-xs text-slate-700">
                  <p className="font-semibold text-slate-900">Target Competencies:</p>
                  <ul className="list-disc list-inside text-slate-600 space-y-1 pl-1">
                    <li>Social engineering and malicious link identification</li>
                    <li>Account credential security and password manager adoption</li>
                    <li>Privacy audits on social media and mobile platforms</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Module 4 */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 uppercase">
                    Module 4
                  </span>
                  <span className="text-xs text-slate-400 font-medium">Weeks 13–16</span>
                </div>
                <h3 className="text-base font-bold text-slate-900">Digital Problem Solving & Troubleshooting</h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Diagnosing basic hardware/software glitches, operating system configuration, independent tool adoption, and computing workflow automation.
                </p>
                <div className="mt-4 space-y-1.5 text-xs text-slate-700">
                  <p className="font-semibold text-slate-900">Target Competencies:</p>
                  <ul className="list-disc list-inside text-slate-600 space-y-1 pl-1">
                    <li>System crash diagnosis and driver troubleshooting</li>
                    <li>Command-line basics and package installations</li>
                    <li>Autonomous technical inquiry via documentation and forums</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'matrix' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs">
          <div className="mb-4">
            <h3 className="text-base font-bold text-slate-900">{isDigCompSat ? 'Complete 82-Item Self-Rating Distribution' : 'Complete 30-Item Response Rating Distribution'}</h3>
            <p className="text-xs text-slate-500">
              {isDigCompSat ? 'Per-item self-ratings are shown on the 0–3 scale. Response wording differs for knowledge, skills, and attitude items; small counts are suppressed.' : 'Aggregated frequency of ratings (4 = Confident, 3 = Occasional difficulty, 2 = Much difficulty, 1 = Cannot do) across submissions.'}
            </p>
          </div>

          <div className="space-y-3 sm:hidden">
            {competenceMatrix.map((item) => (
              <article key={item.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-lg bg-slate-900 px-2 py-0.5 font-bold text-white">#{item.question_number}</span>
                    {isDigCompSat && item.framework_competence_id && (
                      <span className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] text-slate-600">
                        {item.framework_competence_id}
                      </span>
                    )}
                    <span className="font-bold text-green-600">{item.area_code}</span>
                    {isDigCompSat && item.response_type && (
                      <span className="text-[11px] text-slate-500">· {item.response_type}</span>
                    )}
                  </div>
                  <span className="font-extrabold text-slate-900">
                    Mean: {item.suppressed ? 'Suppressed' : item.mean_rating ?? 'N/A'}
                  </span>
                </div>
                <p className="mt-2 font-medium leading-relaxed text-slate-800">{item.question_text}</p>
                <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-slate-200/70 pt-2.5 text-center text-[11px]">
                  {(isDigCompSat ? [3, 2, 1, 0] : [4, 3, 2, 1]).map((rating) => (
                    <div key={rating} className="rounded-lg border border-slate-200/70 bg-white px-2 py-1.5">
                      <dt className="text-[10px] font-semibold uppercase text-slate-500">R{rating}</dt>
                      <dd className="mt-0.5 font-mono font-bold text-slate-800">
                        {item.suppressed ? '—' : item[`count_${rating}`] ?? 0}
                      </dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-bold">
                  <th className="py-2.5 px-3">#</th>
                  {isDigCompSat && <th className="py-2.5 px-2">DigComp ID</th>}
                  <th className="py-2.5 px-3">Area</th>
                  <th className="py-2.5 px-3">Item Statement</th>
                  {isDigCompSat && <th className="py-2.5 px-2 text-center">Type</th>}
                  <th className="py-2.5 px-3 text-center">Mean</th>
                  {(isDigCompSat ? [3, 2, 1, 0] : [4, 3, 2, 1]).map((rating) => <th key={rating} className="py-2.5 px-2 text-center">Rating {rating}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {competenceMatrix.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-3 font-bold text-slate-900">{item.question_number}</td>
                    {isDigCompSat && <td className="py-2.5 px-2 font-mono text-slate-600">{item.framework_competence_id}</td>}
                    <td className="py-2.5 px-3 font-bold text-green-600">{item.area_code}</td>
                    <td className="py-2.5 px-3 text-slate-800 font-medium max-w-md">{item.question_text}</td>
                    {isDigCompSat && <td className="py-2.5 px-2 text-center text-slate-600">{item.response_type}</td>}
                    <td className="py-2.5 px-3 text-center font-extrabold text-slate-900">
                      {item.suppressed ? 'Suppressed' : item.mean_rating ?? 'N/A'}
                    </td>
                    {(isDigCompSat ? [3, 2, 1, 0] : [4, 3, 2, 1]).map((rating) => <td key={rating} className="py-2.5 px-2 text-center font-mono font-bold text-slate-700">
                      {item.suppressed ? '—' : item[`count_${rating}`] ?? 0}
                    </td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsAnalytics;

