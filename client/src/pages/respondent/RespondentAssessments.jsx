import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileCheck,
  PlayCircle,
  RefreshCw,
  Search,
  Timer,
} from 'lucide-react';
import api from '../../api/axios';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import PageHeader from '../../components/common/PageHeader';
import { formatDateTime, parseStoredDate } from '../../utils/helpers';

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
    tone: 'bg-sky-50 text-sky-800 ring-sky-200',
    Icon: Timer,
  },
  available: {
    label: 'Ready to take',
    tone: 'bg-green-50 text-green-800 ring-green-200',
    Icon: PlayCircle,
  },
  scheduled: {
    label: 'Scheduled',
    tone: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
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
];

export const RespondentAssessments = () => {
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
    fetchAssessments();
  }, [fetchAssessments]);

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
    completed: assessedItems.filter((item) => item.displayState === 'completed').length,
  }), [assessedItems]);

  const filteredAssessments = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return assessedItems.filter((assessment) => {
      const matchesFilter = activeFilter === 'all' || assessment.displayState === activeFilter;
      const searchableText = `${assessment.title || ''} ${assessment.description || ''}`.toLocaleLowerCase();
      return matchesFilter && (!normalizedQuery || searchableText.includes(normalizedQuery));
    });
  }, [activeFilter, assessedItems, query]);

  if (loading) return <LoadingSpinner text="Loading your assessments..." />;

  const summaryCards = [
    { label: 'Assigned', value: counts.all, Icon: ClipboardList, tone: 'bg-slate-100 text-slate-700' },
    { label: 'Ready', value: counts.available, Icon: PlayCircle, tone: 'bg-green-50 text-green-700' },
    { label: 'In progress', value: counts.in_progress, Icon: Timer, tone: 'bg-sky-50 text-sky-700' },
    { label: 'Completed', value: counts.completed, Icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700' },
  ];

  return (
    <div className="dlas-respondent-assessments space-y-6 sm:space-y-7">
      <PageHeader
        eyebrow="Student workspace · Learning path"
        title="My Assessments"
        description="Browse every assessment assigned to you, continue in-progress work, or review completed results."
        action={(
          <button
            type="button"
            onClick={() => fetchAssessments(true)}
            disabled={refreshing}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-green-200 hover:bg-green-50 hover:text-green-800 disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
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

      <section aria-label="Assessment summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:gap-4">
        {summaryCards.map(({ label, value, Icon, tone }) => (
          <article key={label} className="flex min-h-24 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 xl:min-h-28 xl:gap-5 xl:p-6">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl xl:h-12 xl:w-12 ${tone}`}>
              <Icon aria-hidden="true" className="h-5 w-5 xl:h-6 xl:w-6" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{label}</p>
              <p className="mt-0.5 text-2xl font-bold tracking-tight text-slate-950 xl:text-3xl">{value}</p>
            </div>
          </article>
        ))}
      </section>

      <section aria-labelledby="assessment-list-heading" className="space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-green-700">Your learning path</p>
            <h2 id="assessment-list-heading" className="mt-1 text-xl font-bold tracking-tight text-slate-950">Assigned assessments</h2>
            <p className="mt-1 text-sm text-slate-600">{assessments.length} {assessments.length === 1 ? 'assessment' : 'assessments'} assigned</p>
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

        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter assessments by status">
          {filterOptions.map((option) => {
            const selected = activeFilter === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setActiveFilter(option.id)}
                aria-pressed={selected}
                className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 ${selected ? 'border-green-700 bg-green-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-green-200 hover:bg-green-50 hover:text-green-800'}`}
              >
                {option.label}
                <span className={`rounded-full px-2 py-0.5 text-xs ${selected ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'}`}>{counts[option.id]}</span>
              </button>
            );
          })}
        </div>

        {filteredAssessments.length ? (
          <div className="space-y-3">
            {filteredAssessments.map((assessment) => {
              const status = statusDetails[assessment.displayState];
              const StatusIcon = status.Icon;
              const isCompleted = assessment.displayState === 'completed';
              const isUnavailable = assessment.displayState === 'scheduled' || assessment.displayState === 'closed';
              const opensAt = assessment.start_date ? parseStoredDate(assessment.start_date)?.getTime() : null;
              const closesAt = assessment.end_date ? parseStoredDate(assessment.end_date)?.getTime() : null;

              return (
                <article key={assessment.id} className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-green-200 hover:shadow-md sm:p-6 xl:flex-row xl:items-center xl:justify-between xl:gap-7 xl:p-7">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ${status.tone}`}>
                        <StatusIcon aria-hidden="true" className="h-3.5 w-3.5" />
                        {status.label}
                      </span>
                      <span className="text-sm text-slate-500">{assessment.question_count || 30} questions</span>
                    </div>
                    <h3 className="mt-2.5 break-words text-lg font-bold tracking-tight text-slate-950">{assessment.title}</h3>
                    {assessment.description && <p className="mt-1.5 max-w-4xl text-sm leading-6 text-slate-600">{assessment.description}</p>}
                    {(assessment.start_date || assessment.end_date) && (
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        {assessment.start_date && <>Opens {formatDateTime(assessment.start_date)}</>}
                        {assessment.start_date && assessment.end_date && ' · '}
                        {assessment.end_date && <>Closes {formatDateTime(assessment.end_date)}</>}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 xl:pl-4">
                    {isCompleted ? (
                      <Link to={`/respondent/assessments/${assessment.attempt_id}/results`} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-green-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 xl:w-auto">
                        <FileCheck aria-hidden="true" className="mr-2 h-4 w-4" />
                        View results
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
                    {!isUnavailable && assessment.attempt_status === 'completed' && assessment.displayState !== 'completed' && <p className="mt-2 text-center text-xs text-slate-500">{Math.max(0, Number(assessment.max_attempts || 1) - Number(assessment.attempt_count || 1))} attempt(s) remaining</p>}
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
            <p className="text-base font-semibold text-slate-900">{assessments.length ? 'No matching assessments' : 'No assessments assigned yet'}</p>
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">
              {assessments.length ? 'Try another status filter or search term.' : 'New assessments from your instructor will appear here.'}
            </p>
            {assessments.length > 0 && (query || activeFilter !== 'all') && (
              <button type="button" onClick={() => { setQuery(''); setActiveFilter('all'); }} className="mt-4 rounded-lg px-3 py-2 text-sm font-semibold text-green-800 hover:bg-green-50">
                Clear filters
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

export default RespondentAssessments;
