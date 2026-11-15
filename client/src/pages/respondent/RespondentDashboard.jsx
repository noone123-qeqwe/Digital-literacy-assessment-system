import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../contexts/useAuth';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import {
  AlertCircle,
  ArrowRight,
  Award,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileCheck2,
  History,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { getProficiencyLevel, formatDateTime, parseStoredDate } from '../../utils/helpers';

const formatCount = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

export const RespondentDashboard = () => {
  const { user } = useAuth();
  const [assessments, setAssessments] = useState([]);
  const [myAttempts, setMyAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [activeProgressView, setActiveProgressView] = useState('latest');

  const fetchDashboardData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [assessmentResponse, attemptResponse] = await Promise.all([
        api.get('/assessments'),
        api.get('/attempts/my'),
      ]);
      if (assessmentResponse.data.success) setAssessments(assessmentResponse.data.data);
      if (attemptResponse.data.success) setMyAttempts(attemptResponse.data.data);
      setError('');
    } catch (requestError) {
      console.error('Failed to load respondent dashboard:', requestError);
      setError(requestError.response?.data?.message || 'We could not load your latest dashboard information. Try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (loading) return <LoadingSpinner text="Loading your assessment profile..." />;

  const completedAttempts = myAttempts
    .filter((attempt) => attempt.status === 'completed')
    .sort((first, second) => (
      (parseStoredDate(second.completed_at)?.getTime() || 0) -
      (parseStoredDate(first.completed_at)?.getTime() || 0)
    ));
  const latestCompletedAttempt = completedAttempts[0];
  const visibleHistory = showAllHistory ? completedAttempts : completedAttempts.slice(0, 3);
  const nextAssessment = [...assessments]
    .sort((first, second) => {
      const priority = (item) => {
        if (item.attempt_status === 'in_progress') return 0;
        if (item.attempt_status === 'completed' && Number(item.attempt_count || 1) >= Number(item.max_attempts || 1)) return 3;
        const opensAt = item.start_date ? parseStoredDate(item.start_date)?.getTime() : null;
        const closesAt = item.end_date ? parseStoredDate(item.end_date)?.getTime() : null;
        if (opensAt && currentTime < opensAt) return 2;
        if (closesAt && currentTime > closesAt) return 4;
        return 1;
      };
      return priority(first) - priority(second);
    })
    .find((item) => {
      if (item.attempt_status === 'completed' && Number(item.attempt_count || 1) >= Number(item.max_attempts || 1)) return false;
      if (item.attempt_status === 'expired') return false;
      return item.attempt_status === 'in_progress' || !item.end_date || parseStoredDate(item.end_date)?.getTime() >= currentTime;
    });

  const profile = user?.profile;
  const hasCompleteProfile = Boolean(
    profile?.age && profile?.sex && profile?.municipality && profile?.barangay &&
    profile?.junior_high_school && profile?.junior_high_school_type &&
    profile?.senior_high_school && profile?.senior_high_school_type && profile?.shs_strand &&
    profile?.monthly_family_income_amount !== null && profile?.monthly_family_income_amount !== undefined &&
    profile?.has_computer_at_home !== null && profile?.has_computer_at_home !== undefined && profile?.internet_access_type
  );
  const pendingAssessments = assessments.filter((assessment) => {
    if (assessment.attempt_status === 'completed' && Number(assessment.attempt_count || 1) >= Number(assessment.max_attempts || 1)) return false;
    if (assessment.attempt_status === 'expired') return false;
    if (assessment.attempt_status === 'in_progress') return true;
    return !assessment.end_date || parseStoredDate(assessment.end_date)?.getTime() >= currentTime;
  });
  const latestLevel = getProficiencyLevel(latestCompletedAttempt?.overall_mean);
  const scorePercent = latestCompletedAttempt
    ? Math.max(0, Math.min(100, (Number(latestCompletedAttempt.overall_mean) / 4) * 100 || 0))
    : 0;
  const stats = [
    { label: 'To complete', value: pendingAssessments.length, caption: pendingAssessments.length ? 'Waiting for you' : 'All caught up', Icon: ClipboardList, tone: 'bg-emerald-100 text-emerald-800' },
    { label: 'Completed', value: completedAttempts.length, caption: 'Submitted assessments', Icon: CheckCircle2, tone: 'bg-teal-100 text-teal-800' },
    { label: 'Latest score', value: latestCompletedAttempt ? latestCompletedAttempt.overall_mean : '—', caption: latestCompletedAttempt ? `${latestLevel.label} proficiency` : 'Complete an assessment first', Icon: Award, tone: 'bg-amber-100 text-amber-800' },
  ];

  const hasRetake = nextAssessment?.attempt_status === 'completed' && Number(nextAssessment.attempt_count || 1) < Number(nextAssessment.max_attempts || 1);
  const inProgress = nextAssessment?.attempt_status === 'in_progress';
  const opensAt = nextAssessment?.start_date ? parseStoredDate(nextAssessment.start_date)?.getTime() : null;
  const closesAt = nextAssessment?.end_date ? parseStoredDate(nextAssessment.end_date)?.getTime() : null;
  const isScheduled = Boolean(nextAssessment && !inProgress && !hasRetake && opensAt && currentTime < opensAt);
  const isClosed = Boolean(nextAssessment && !inProgress && !hasRetake && closesAt && currentTime > closesAt);
  const dateLabel = nextAssessment?.end_date
    ? `${isScheduled ? 'Opens' : 'Due'} ${formatDateTime(isScheduled ? nextAssessment.start_date : nextAssessment.end_date)}`
    : nextAssessment?.start_date ? `Opens ${formatDateTime(nextAssessment.start_date)}` : null;

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-3 sm:space-y-4 xl:space-y-5">
      <section className="relative isolate overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-green-950 via-green-900 to-emerald-800 px-5 py-4 text-white shadow-lg shadow-green-950/10 sm:px-7 sm:py-5 lg:flex lg:items-center lg:justify-between lg:gap-8 lg:px-9">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-28 -z-10 h-72 w-72 rounded-full border-[32px] border-white/[0.06] sm:-right-6 sm:h-96 sm:w-96" />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-[-5rem] right-[18%] -z-10 h-36 w-36 rounded-full bg-emerald-300/10 blur-2xl" />
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-100 sm:text-xs">
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-amber-300" />
            Student workspace <span className="text-white/40">·</span> DigComp 2.1
          </div>
          <h1 className="mt-3 text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl lg:text-[2.15rem]">Welcome back, {user?.first_name || 'student'}</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-5 text-emerald-50/85 sm:text-base sm:leading-6">Your next step, current progress, and latest results in one place.</p>
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row lg:mt-0 lg:shrink-0 lg:items-center">
          {!hasCompleteProfile && <Link to="/respondent/profile" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-200/40 bg-amber-300/15 px-4 py-2.5 text-sm font-bold text-amber-50 transition hover:bg-amber-300/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <AlertCircle aria-hidden="true" className="h-4 w-4" /> Complete your profile
          </Link>}
          <button type="button" onClick={() => fetchDashboardData(true)} disabled={refreshing} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-60">
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </section>

      {error && <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 sm:flex-row sm:items-center sm:justify-between">
        <p>{error}</p><button type="button" onClick={() => fetchDashboardData(true)} className="min-h-10 shrink-0 rounded-lg px-3 font-semibold text-rose-800 transition hover:bg-rose-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-700">Try again</button>
      </div>}

      <section aria-label="Your assessment summary" className="grid grid-cols-3 gap-2.5 sm:gap-4">
        {stats.map(({ label, value, caption, Icon, tone }) => <article key={label} className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm sm:flex sm:min-h-24 sm:items-center sm:gap-4 sm:p-4">
          <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone} sm:h-12 sm:w-12 sm:shrink-0`}><Icon aria-hidden="true" className="h-[18px] w-[18px] sm:h-6 sm:w-6" /></span>
          <div className="mt-2 min-w-0 sm:mt-0">
            <p className="min-h-7 text-[9px] font-bold uppercase leading-3 tracking-[0.1em] text-slate-500 sm:min-h-0 sm:text-xs sm:leading-4">{label}</p>
            <p className="mt-0.5 truncate text-base font-extrabold leading-5 tracking-tight text-slate-950 sm:text-2xl sm:leading-7">{value}</p>
            <p className="mt-1 hidden text-xs leading-4 text-slate-500 sm:block">{caption}</p>
          </div>
        </article>)}
      </section>

      <div className="grid min-w-0 gap-4 lg:gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(19rem,0.85fr)]">
        <section aria-labelledby="next-assessment-title" className="min-w-0 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-green-800 sm:text-xs">Your learning path</p>
              <h2 id="next-assessment-title" className="mt-1 text-lg font-extrabold tracking-tight text-slate-950 sm:text-xl">Next assessment</h2>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-600 sm:text-xs"><ClipboardList aria-hidden="true" className="h-3.5 w-3.5" />{formatCount(assessments.length, 'assessment')}</span>
          </div>

          {nextAssessment ? <div className="p-4 sm:p-6">
            <div className="rounded-2xl border border-green-100 bg-gradient-to-br from-green-50/80 via-white to-emerald-50/70 p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${inProgress ? 'bg-sky-100 text-sky-800' : isClosed ? 'bg-slate-200 text-slate-700' : isScheduled ? 'bg-violet-100 text-violet-800' : 'bg-emerald-100 text-emerald-800'}`}>
                  {inProgress ? <Clock3 aria-hidden="true" className="h-3 w-3" /> : <CheckCircle2 aria-hidden="true" className="h-3 w-3" />}
                  {inProgress ? 'In progress' : isClosed ? 'Closed' : isScheduled ? 'Coming soon' : hasRetake ? 'Retake available' : 'Ready when you are'}
                </span>
                <span className="text-xs font-medium text-slate-500">{formatCount(nextAssessment.question_count || 30, 'question')}</span>
              </div>
              <h3 className="mt-3 break-words text-lg font-extrabold leading-snug tracking-tight text-slate-950 sm:text-xl">{nextAssessment.title}</h3>
              {nextAssessment.description && <p className="mt-1.5 line-clamp-2 max-w-3xl text-sm leading-5 text-slate-600">{nextAssessment.description}</p>}
              {dateLabel && <p className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-slate-600"><CalendarClock aria-hidden="true" className="h-4 w-4 text-green-800" />{dateLabel}</p>}
              <div className="mt-4 flex flex-col gap-2 border-t border-green-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-slate-500">{inProgress ? 'Pick up where you left off.' : hasRetake ? `You have completed ${nextAssessment.attempt_count} of ${nextAssessment.max_attempts} attempts.` : isScheduled ? 'This assessment will be available at the scheduled time.' : isClosed ? 'The availability period for this assessment has ended.' : 'Your answers are saved as you go.'}</p>
                {isScheduled || isClosed ? <button type="button" disabled className="inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center rounded-xl bg-slate-200 px-5 text-sm font-bold text-slate-500 sm:w-auto">{isScheduled ? 'Not open yet' : 'Availability ended'}</button> : <Link to={`/respondent/assessments/${nextAssessment.id}/take`} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-green-800 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-green-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 sm:w-auto">
                  {inProgress ? 'Resume assessment' : hasRetake ? `Start attempt ${Number(nextAssessment.attempt_count) + 1}` : 'Start assessment'} <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>}
              </div>
            </div>
            <Link to="/respondent/assessments" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-green-900 transition hover:bg-green-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700">View all assessments <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
          </div> : <div className="flex min-h-52 flex-col items-center justify-center px-6 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-50 text-green-800"><BookOpenCheck aria-hidden="true" className="h-6 w-6" /></span>
            <h3 className="mt-3 text-base font-bold text-slate-900">You’re all caught up</h3>
            <p className="mt-1 max-w-sm text-sm leading-5 text-slate-500">There are no assessments waiting right now. New work from your instructor will appear here.</p>
            <Link to="/respondent/assessments" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-green-200 px-4 text-sm font-semibold text-green-900 transition hover:bg-green-50">Open my assessments <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
          </div>}
        </section>

        <section aria-label="Your results and assessment history" className="min-w-0 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Award aria-hidden="true" className="h-5 w-5" /></span>
            <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-800 sm:text-xs">Your progress</p><h2 className="mt-0.5 text-lg font-extrabold tracking-tight text-slate-950">Results & history</h2></div>
          </div>
          <div role="tablist" aria-label="Progress views" className="grid grid-cols-2 gap-1 border-b border-slate-100 bg-slate-50/80 p-2">
            <button id="latest-result-tab" type="button" role="tab" aria-selected={activeProgressView === 'latest'} aria-controls="latest-result-panel" onClick={() => setActiveProgressView('latest')} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-green-700 sm:text-sm ${activeProgressView === 'latest' ? 'bg-white text-green-900 shadow-sm' : 'text-slate-600 hover:bg-white/70'}`}><Award aria-hidden="true" className="h-4 w-4" /> Latest result</button>
            <button id="history-tab" type="button" role="tab" aria-selected={activeProgressView === 'history'} aria-controls="history-panel" onClick={() => setActiveProgressView('history')} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-green-700 sm:text-sm ${activeProgressView === 'history' ? 'bg-white text-green-900 shadow-sm' : 'text-slate-600 hover:bg-white/70'}`}><History aria-hidden="true" className="h-4 w-4" /> History <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px]">{completedAttempts.length}</span></button>
          </div>

          {activeProgressView === 'latest' ? <div id="latest-result-panel" role="tabpanel" aria-labelledby="latest-result-tab" className="p-4 sm:p-5">
            {latestCompletedAttempt ? <div className="space-y-4">
              <div className="flex items-center gap-4 rounded-2xl bg-gradient-to-r from-green-50 to-emerald-50 p-4 ring-1 ring-green-100 sm:p-5">
                <div className="relative grid h-[4.5rem] w-[4.5rem] shrink-0 place-items-center rounded-full sm:h-20 sm:w-20" style={{ background: `conic-gradient(#16834b ${scorePercent}%, #dceee3 ${scorePercent}% 100%)` }} role="img" aria-label={`Overall weighted mean ${latestCompletedAttempt.overall_mean} out of 4`}>
                  <div className="grid h-[3.65rem] w-[3.65rem] place-content-center rounded-full bg-white text-center sm:h-[4.2rem] sm:w-[4.2rem]"><span className="text-lg font-extrabold leading-5 text-slate-950 sm:text-xl">{latestCompletedAttempt.overall_mean}</span><span className="mt-0.5 text-[9px] font-medium text-slate-500">out of 4</span></div>
                </div>
                <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-green-900 sm:text-xs">Latest proficiency</p><p className="mt-1 text-base font-extrabold leading-5 text-slate-950 sm:text-lg">{latestLevel.label}</p><p className="mt-1 text-xs leading-4 text-slate-600">Your overall digital literacy score</p></div>
              </div>
              <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900" title={latestCompletedAttempt.assessment_title}>{latestCompletedAttempt.assessment_title}</p><p className="mt-1 text-xs text-slate-500">Submitted {formatDateTime(latestCompletedAttempt.completed_at)}</p></div>
              <Link to={`/respondent/assessments/${latestCompletedAttempt.id}/results`} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 text-sm font-bold text-green-900 transition hover:bg-green-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700">View scores and recommendations <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
              <Link to="/respondent/learning" className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs font-bold text-green-900 transition hover:bg-green-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"><BookOpenCheck aria-hidden="true" className="h-4 w-4" /> Explore learning resources <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></Link>
            </div> : <div className="flex min-h-48 flex-col items-center justify-center px-3 py-6 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Award aria-hidden="true" className="h-5 w-5" /></span>
              <h3 className="mt-3 text-base font-bold text-slate-800">Your results will appear here</h3>
              <p className="mt-1 max-w-xs text-sm leading-5 text-slate-500">Complete an assessment to see your competence score and recommendations.</p>
              <Link to="/respondent/learning" className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-bold text-green-900 transition hover:bg-green-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"><BookOpenCheck aria-hidden="true" className="h-4 w-4" /> Explore learning resources <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></Link>
            </div>}
          </div> : <div id="history-panel" role="tabpanel" aria-labelledby="history-tab" className="p-4 sm:p-5">
            {completedAttempts.length ? <>
              <ul id="assessment-history-list" className="divide-y divide-slate-100">{visibleHistory.map((attempt) => {
                const level = getProficiencyLevel(attempt.overall_mean);
                return <li key={attempt.id} className="flex min-w-0 items-center justify-between gap-2 py-3 first:pt-0 last:pb-0 sm:gap-4">
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{attempt.assessment_title}</p><p className="mt-1 text-xs text-slate-500">{formatDateTime(attempt.completed_at)}</p></div>
                  <div className="flex shrink-0 items-center gap-2 sm:gap-3"><div className="text-right"><p className="text-sm font-extrabold text-slate-900">{attempt.overall_mean ?? 'N/A'} <span className="text-xs font-medium text-slate-500">/ 4</span></p><span className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${level.badgeColor}`}>{level.label}</span></div><Link to={`/respondent/assessments/${attempt.id}/results`} className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 px-3 text-xs font-bold text-green-900 transition hover:border-green-200 hover:bg-green-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700" aria-label={`View results for ${attempt.assessment_title}`}><FileCheck2 aria-hidden="true" className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">View</span></Link></div>
                </li>;
              })}</ul>
              {completedAttempts.length > 3 && <button type="button" onClick={() => setShowAllHistory((current) => !current)} className="mt-3 inline-flex min-h-10 items-center rounded-lg px-3 text-xs font-bold text-green-900 transition hover:bg-green-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700" aria-expanded={showAllHistory} aria-controls="assessment-history-list">{showAllHistory ? 'Show fewer results' : `Show all ${completedAttempts.length} results`}</button>}
            </> : <div className="flex min-h-48 flex-col items-center justify-center px-3 py-6 text-center"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><FileCheck2 aria-hidden="true" className="h-5 w-5" /></span><p className="mt-3 text-sm font-bold text-slate-800">No completed assessments yet</p><p className="mt-1 text-xs text-slate-500">Your submitted results will appear here.</p></div>}
          </div>}
        </section>
      </div>

    </div>
  );
};

export default RespondentDashboard;
