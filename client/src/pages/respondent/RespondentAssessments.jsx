import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Award,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileCheck,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Timer,
} from 'lucide-react';
import api from '../../api/axios';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import PageHeader from '../../components/common/PageHeader';
import { useDemoMode } from '../../contexts/useDemoMode';
import { formatDateTime, parseStoredDate } from '../../utils/helpers';
import { BookmarkButton, BookmarkFilter } from '../../components/assessments/AssessmentBookmarks';
import { useAssessmentBookmarks } from '../../components/assessments/useAssessmentBookmarks';

const getAssessmentState = (assessment, now) => {
  if (assessment.attempt_status === 'completed') {
    const remainingAttempts = Math.max(0, Number(assessment.max_attempts || 1) - Number(assessment.attempt_count || 1));
    if (!remainingAttempts) return 'completed';
  }
  if (assessment.attempt_status === 'in_progress') return 'in_progress';
  if (assessment.attempt_status === 'expired') return 'closed';

  const opensAt = assessment.start_date ? parseStoredDate(assessment.start_date)?.getTime() : null;
  const closesAt = assessment.end_date ? parseStoredDate(assessment.end_date)?.getTime() : null;
  if (opensAt && now < opensAt) return 'scheduled';
  if (closesAt && now > closesAt) return 'closed';
  return 'available';
};

const statusDetails = {
  completed: {
    label: 'Completed',
    tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    Icon: CheckCircle2,
  },
  in_progress: {
    label: 'In progress',
    tone: 'bg-amber-50 text-amber-800 ring-amber-200',
    Icon: Timer,
  },
  available: {
    label: 'Ready to take',
    tone: 'bg-green-50 text-green-800 ring-green-200',
    Icon: PlayCircle,
  },
  scheduled: {
    label: 'Scheduled',
    tone: 'bg-stone-100 text-stone-700 ring-stone-200',
    Icon: CalendarClock,
  },
  closed: {
    label: 'Closed',
    tone: 'bg-slate-100 text-slate-700 ring-slate-200',
    Icon: ClipboardList,
  },
};

const filterOptions = [
  { id: 'all', label: 'All assessments' },
  { id: 'available', label: 'Ready' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'closed', label: 'Closed' },
];

export const RespondentAssessments = () => {
  const bookmarks = useAssessmentBookmarks('research');
  const [showBookmarks, setShowBookmarks] = useState(false);
  const { available: demoStatusAvailable, freeDemoReadOnly, loading: demoModeLoading } = useDemoMode();
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [now, setNow] = useState(() => Date.now());

  const fetchAssessments = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await api.get('/assessments');
      if (response.data.success) setAssessments(response.data.data || []);
      setError('');
    } catch (requestError) {
      console.error('Failed to load respondent assessments:', requestError);
      setError(requestError.response?.data?.message || 'We could not load your assessments. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const loadAssessments = async () => {
      try {
        const response = await api.get('/assessments');
        if (!active) return;
        if (response.data.success) setAssessments(response.data.data || []);
        setError('');
      } catch (requestError) {
        if (!active) return;
        console.error('Failed to load respondent assessments:', requestError);
        setError(requestError.response?.data?.message || 'We could not load your assessments. Please try again.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadAssessments();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const assessedItems = useMemo(() => assessments.map((assessment) => ({
    ...assessment,
    displayState: getAssessmentState(assessment, now),
  })), [assessments, now]);

  const counts = useMemo(() => ({
    all: assessedItems.length,
    available: assessedItems.filter((item) => item.displayState === 'available').length,
    in_progress: assessedItems.filter((item) => item.displayState === 'in_progress').length,
    completed: assessedItems.filter((item) => item.attempt_status === 'completed').length,
    scheduled: assessedItems.filter((item) => item.displayState === 'scheduled').length,
    closed: assessedItems.filter((item) => item.displayState === 'closed').length,
  }), [assessedItems]);

  const filteredAssessments = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const priority = { in_progress: 0, available: 1, scheduled: 2, completed: 3, closed: 4 };
    return assessedItems.filter((assessment) => {
      const matchesFilter = activeFilter === 'completed'
        ? assessment.attempt_status === 'completed'
        : activeFilter === 'all' || assessment.displayState === activeFilter;
      const searchableText = `${assessment.title || ''} ${assessment.description || ''}`.toLocaleLowerCase();
      return matchesFilter && (!showBookmarks || bookmarks.saved.includes(assessment.id)) && (!normalizedQuery || searchableText.includes(normalizedQuery));
    }).sort((first, second) => (priority[first.displayState] ?? 5) - (priority[second.displayState] ?? 5));
  }, [activeFilter, assessedItems, query, showBookmarks, bookmarks.saved]);

  if (loading) return <LoadingSpinner text="Loading your assessments..." />;

  const summaryCards = [
    { label: 'Assigned', value: counts.all, Icon: ClipboardList, tone: 'bg-slate-100 text-slate-700' },
    { label: 'Ready', value: counts.available, Icon: PlayCircle, tone: 'bg-green-50 text-green-700' },
    { label: 'In progress', value: counts.in_progress, Icon: Timer, tone: 'bg-amber-50 text-amber-700' },
    { label: 'Completed', value: counts.completed, Icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700' },
  ];
  const canDownloadAward = demoStatusAvailable && !demoModeLoading && !freeDemoReadOnly;

  return (
    <div className="dlas-respondent-assessments mx-auto max-w-[1440px] space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow="Student workspace · Learning path"
        title="My Assessments"
        description="Continue an assessment or review your completed results."
        action={(
          <button
            type="button"
            onClick={() => fetchAssessments(true)}
            disabled={refreshing}
            aria-label={refreshing ? 'Refreshing assessments' : 'Refresh assessments'}
            title="Refresh assessments"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-green-200 hover:bg-green-50 hover:text-green-800 disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="assessment-refresh-label">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        )}
      />

      {error && (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 sm:flex-row sm:items-center sm:justify-between">
          <p>{error}</p>
          <button type="button" onClick={() => fetchAssessments(true)} className="shrink-0 rounded-lg px-3 py-2 font-semibold text-rose-800 transition hover:bg-rose-100">
            Try again
          </button>
        </div>
      )}

      {(!error || assessedItems.length > 0) && <>
      <BookmarkFilter bookmarks={bookmarks} records={assessments} selected={showBookmarks} setSelected={setShowBookmarks} />
      <section aria-label="Assessment summary" className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        {summaryCards.map(({ label, value, Icon, tone }) => (
          <article key={label} className="flex min-h-20 min-w-0 items-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:gap-4 sm:p-4">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-11 sm:w-11 ${tone}`}>
              <Icon aria-hidden="true" className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>
            <div>
              <p className="text-xs font-semibold text-slate-600">{label}</p>
              <p className="mt-0.5 text-2xl font-bold tracking-tight text-slate-950 xl:text-3xl">{value}</p>
            </div>
          </article>
        ))}
      </section>

      {counts.all > 0 && <section aria-label="Assessment completion" className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3 sm:flex sm:items-center sm:gap-6 sm:px-5">
        <div className="flex shrink-0 items-center justify-between gap-3 sm:block">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Overall progress</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">{counts.completed} of {counts.all} assessments completed</p>
          </div>
          <span className="text-lg font-extrabold tabular-nums text-green-800 sm:hidden">{counts.all ? Math.round((counts.completed / counts.all) * 100) : 0}%</span>
        </div>
        <div className="mt-3 flex-1 sm:mt-0">
          <div
            className="h-2.5 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-label="Overall assessment completion"
            aria-valuemin={0}
            aria-valuemax={Math.max(counts.all, 1)}
            aria-valuenow={counts.completed}
          >
            <div className="h-full rounded-full bg-gradient-to-r from-green-700 to-emerald-500 transition-[width] duration-500" style={{ width: `${counts.all ? (counts.completed / counts.all) * 100 : 0}%` }} />
          </div>
        </div>
        <span className="hidden shrink-0 text-lg font-extrabold tabular-nums text-green-800 sm:block">{counts.all ? Math.round((counts.completed / counts.all) * 100) : 0}%</span>
      </section>}

      <section aria-labelledby="assessment-list-heading" className="space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 id="assessment-list-heading" className="mt-1 text-xl font-bold tracking-tight text-slate-950">Assigned assessments</h2>
            <p className="mt-1 text-sm text-slate-600" role="status">{filteredAssessments.length} of {assessments.length} {assessments.length === 1 ? 'assessment' : 'assessments'} shown</p>
          </div>

          <label className="relative block w-full xl:max-w-sm">
            <span className="sr-only">Search assessments</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by assessment name"
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-green-600 focus:outline-none focus:ring-4 focus:ring-green-100"
            />
          </label>
        </div>

        <label className="block sm:hidden">
          <span className="mb-1.5 block text-sm font-semibold text-slate-700">Assessment status</span>
          <select value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-slate-900">
            {filterOptions.map((option) => <option key={option.id} value={option.id}>{option.label} ({counts[option.id]})</option>)}
          </select>
        </label>
        <div className="hidden flex-wrap gap-2 sm:flex" role="group" aria-label="Filter assessments by status">
          {filterOptions.map((option) => {
            const selected = activeFilter === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setActiveFilter(option.id)}
                aria-pressed={selected}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition ${selected ? 'border-green-700 bg-green-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-green-200 hover:bg-green-50 hover:text-green-800'}`}
              >
                {option.label}
                <span className={`rounded-full px-2 py-0.5 text-xs ${selected ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'}`}>{counts[option.id]}</span>
              </button>
            );
          })}
        </div>

        {filteredAssessments.length ? (
          <div className="space-y-3">
            {filteredAssessments.map((assessment, index) => {
              const status = statusDetails[assessment.displayState];
              const StatusIcon = status.Icon;
              const isCompleted = assessment.displayState === 'completed';
              const hasResult = assessment.attempt_status === 'completed' && Boolean(assessment.attempt_id);
              const isUnavailable = assessment.displayState === 'scheduled' || assessment.displayState === 'closed';
              const isDigCompSat = assessment.scoring_version === 'digcompsat-self-reflection-0-3.1';
              const maxAttempts = Math.max(1, Number(assessment.max_attempts || 1));
              const usedAttempts = Number(assessment.attempt_count || 0);
              const opensAt = assessment.start_date ? parseStoredDate(assessment.start_date)?.getTime() : null;
              const closesAt = assessment.end_date ? parseStoredDate(assessment.end_date)?.getTime() : null;

              return (
                <article key={assessment.id} className={`flex flex-col gap-4 rounded-2xl border bg-white p-4 shadow-sm sm:p-6 xl:flex-row xl:items-center xl:justify-between xl:gap-7 ${assessment.displayState === 'in_progress' ? 'border-l-4 border-l-amber-500' : assessment.displayState === 'available' && index === 0 ? 'border-l-4 border-l-green-600' : 'border-slate-200'}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ${status.tone}`}>
                        <StatusIcon aria-hidden="true" className="h-3.5 w-3.5" />
                        {status.label}
                      </span>
                      {hasResult && canDownloadAward && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200"><Award aria-hidden="true" className="h-3.5 w-3.5" />Award ready</span>}
                      <BookmarkButton assessment={assessment} bookmarks={bookmarks} />
                    </div>
                    <h3 className="mt-3 break-words text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{assessment.title}</h3>
                    <p className={`mt-1 text-xs font-semibold ${isDigCompSat ? 'text-teal-800' : 'text-slate-600'}`}>
                      {isDigCompSat ? 'DigCompSAT · self-reflection · 0–3 scale' : 'Masbate Colleges · research questionnaire · 1–4 scale'}
                    </p>
                    {assessment.description && <p className="mt-1.5 max-w-4xl text-sm leading-6 text-slate-600">{assessment.description}</p>}
                    {hasResult && assessment.overall_mean !== null && assessment.overall_mean !== undefined && (
                      <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-green-100 bg-green-50/70 px-3 py-2 text-sm">
                        <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-green-700" />
                        <span className="font-bold text-slate-900">{Number(assessment.overall_mean).toFixed(2)} / {isDigCompSat ? '3.00' : '4.00'}</span>
                        <span className="text-slate-600">{isDigCompSat ? 'self-rating' : assessment.overall_level || 'result'}</span>
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200"><ClipboardList aria-hidden="true" className="h-3.5 w-3.5 text-slate-500" />{assessment.question_count ?? 30} questions</span>
                      {assessment.time_limit_minutes && <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200"><Timer aria-hidden="true" className="h-3.5 w-3.5 text-slate-500" />{assessment.time_limit_minutes} min</span>}
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-slate-500" />{usedAttempts} of {maxAttempts} attempts used</span>
                    </div>
                    {(assessment.start_date || assessment.end_date) && (
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                        {assessment.start_date && <span className="inline-flex items-center gap-1.5"><CalendarClock aria-hidden="true" className="h-4 w-4 shrink-0" /> Opens {formatDateTime(assessment.start_date)}</span>}
                        {assessment.end_date && <span className="inline-flex items-center gap-1.5"><CalendarClock aria-hidden="true" className="h-4 w-4 shrink-0" /> Closes {formatDateTime(assessment.end_date)}</span>}
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 xl:pl-4">
                    {(isCompleted || isUnavailable) && hasResult ? (
                      <Link to={`/respondent/assessments/${assessment.attempt_id}/results`} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-green-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 xl:w-auto">
                        <FileCheck aria-hidden="true" className="mr-2 h-4 w-4" />
                        {canDownloadAward ? 'View results & award' : 'View results'}
                      </Link>
                    ) : isUnavailable ? (
                      <button type="button" disabled className="inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center rounded-xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-500 xl:w-auto">
                        {assessment.displayState === 'scheduled' ? 'Not open yet' : 'Availability ended'}
                      </button>
                    ) : (
                      <Link to={`/respondent/assessments/${assessment.id}/take`} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-green-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-green-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 xl:w-auto">
                        {assessment.displayState === 'in_progress' ? 'Resume assessment' : assessment.attempt_count ? `Start attempt ${Number(assessment.attempt_count) + 1}` : 'Start assessment'}
                        <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
                      </Link>
                    )}
                    {!isUnavailable && !isCompleted && hasResult && (
                      <Link to={`/respondent/assessments/${assessment.attempt_id}/results`} className="mt-1 flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-semibold text-green-800 hover:bg-green-50">
                        {canDownloadAward ? 'Previous result & award' : 'Previous result'}
                      </Link>
                    )}
                  </div>
                  <span className="sr-only">
                    {opensAt && now < opensAt ? 'This assessment has not opened yet.' : closesAt && now > closesAt ? 'This assessment is closed.' : ''}
                  </span>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-green-50 text-green-700">
              <ClipboardList aria-hidden="true" className="h-6 w-6" />
            </span>
            <p className="text-base font-semibold text-slate-900">{showBookmarks ? 'No matching bookmarked assessments' : assessments.length ? 'No matching assessments' : 'No assessments assigned yet'}</p>
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">
              {showBookmarks ? 'Bookmark an assessment, or adjust your search and status filters.' : assessments.length ? 'Try another status filter or search term.' : 'New assessments from your instructor will appear here.'}
            </p>
            {assessments.length > 0 && (query || activeFilter !== 'all' || showBookmarks) && (
              <button type="button" onClick={() => { setQuery(''); setActiveFilter('all'); setShowBookmarks(false); }} className="mt-4 rounded-lg px-3 py-2 text-sm font-semibold text-green-800 hover:bg-green-50">
                Clear filters
              </button>
            )}
          </div>
        )}
      </section>
      </>}
    </div>
  );
};

export default RespondentAssessments;
