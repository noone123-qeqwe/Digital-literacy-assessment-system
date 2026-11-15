import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import StatCard from '../../components/common/StatCard';
import PageHeader from '../../components/common/PageHeader';
import { KnowledgePulse } from '../knowledge/KnowledgeCommon';
import AreaRadarChart from '../../components/charts/AreaRadarChart';
import ProficiencyChart from '../../components/charts/ProficiencyChart';
import {
  Activity,
  ArrowRight,
  Award,
  CheckCircle2,
  ClipboardList,
  Clock3,
  RefreshCw,
  Users,
  Mail,
  ShieldCheck,
  CircleAlert,
} from 'lucide-react';
import { formatDateTime, getProficiencyLevel } from '../../utils/helpers';
import toast from 'react-hot-toast';

const Panel = ({ children, className = '' }) => (
  <section className={'min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 ' + className}>
    {children}
  </section>
);

const SectionHeading = ({ eyebrow, title, description, action }) => (
  <div className="mb-5 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
    <div className="min-w-0">
      {eyebrow && <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-green-700">{eyebrow}</p>}
      <h2 className="text-base font-bold tracking-tight text-slate-900">{title}</h2>
      {description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
    </div>
    {action}
  </div>
);

const PersonMark = ({ firstName, lastName }) => {
  const initials = ((firstName?.[0] || '') + (lastName?.[0] || '')).toUpperCase() || '?';
  return (
    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-50 text-xs font-bold text-green-800 ring-1 ring-green-100">
      {initials}
    </span>
  );
};

export const AdminDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [readiness, setReadiness] = useState(null);
  const [testingEmail, setTestingEmail] = useState(false);

  const fetchDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await api.get('/analytics/dashboard');
      if (!response.data?.success) throw new Error('Dashboard information is unavailable.');
      setData(response.data.data);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Unable to load dashboard information.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const loadDashboard = async () => {
      try {
        const response = await api.get('/analytics/dashboard');
        if (!response.data?.success) throw new Error('Dashboard information is unavailable.');
        if (!active) return;
        setData(response.data.data);
        setError('');
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.message || requestError.message || 'Unable to load dashboard information.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadDashboard();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    api.get('/system/readiness').then((response) => setReadiness(response.data?.data || null)).catch(() => setReadiness(null));
  }, []);

  const handleEmailTest = async () => {
    try {
      setTestingEmail(true);
      const response = await api.post('/system/readiness/test-email');
      setReadiness((current) => current ? ({ ...current, lastEmailTest: new Date().toISOString() }) : current);
      toast.success(response.data?.message || 'Test email sent.');
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Could not send the test email.');
    } finally {
      setTestingEmail(false);
    }
  };

  if (loading && !data) return <LoadingSpinner text="Loading system overview..." />;

  const summary = data?.summary || {};
  const proficiencyDistribution = data?.proficiencyDistribution || {};
  const areaPerformance = data?.areaPerformance || [];
  const lowestRatedSkills = data?.lowestRatedSkills || [];
  const recentSubmissions = data?.recentSubmissions || [];
  const completedAttempts = Number(summary.completedAttempts || 0);
  const inProgressAttempts = Number(summary.inProgressAttempts || 0);
  const totalAttempts = completedAttempts + inProgressAttempts;
  const completionRate = Math.min(100, Math.max(0, Number(summary.completionRate || 0)));
  const hasScores = Number(summary.scoredAttempts || 0) > 0;
  const averageScore = Number(summary.averageScore);
  const scoreScaleMax = Number(data?.scoreScaleMax) === 3 ? 3 : 4;

  return (
    <div className="space-y-6 sm:space-y-7">
      <KnowledgePulse />
      <PageHeader
        eyebrow="Administration · System overview"
        title="Research assessment overview"
        description="Track participation, assessment completion, and digital literacy outcomes across your cohort."
        action={(
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Link
              to="/admin/assessments"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-green-700 px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-green-800 sm:px-4 sm:text-sm"
            >
              <ClipboardList aria-hidden="true" className="h-4 w-4" />
              <span>Manage assessments</span>
            </Link>
            <button
              type="button"
              onClick={() => fetchDashboard(true)}
              disabled={refreshing}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:border-green-200 hover:bg-green-50 hover:text-green-800 disabled:opacity-60 sm:px-4 sm:text-sm"
            >
              <RefreshCw aria-hidden="true" className={'h-4 w-4 ' + (refreshing ? 'animate-spin' : '')} />
              <span>{refreshing ? 'Refreshing' : 'Refresh'}</span>
            </button>
          </div>
        )}
      />

      {error && (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between">
          <p>{data ? 'The latest refresh failed. Displaying the last available dashboard data.' : error}</p>
          <button
            type="button"
            onClick={() => fetchDashboard(Boolean(data))}
            className="shrink-0 self-start rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 sm:self-auto"
          >
            Try again
          </button>
        </div>
      )}

      {readiness && <Panel className="border-green-100 bg-gradient-to-br from-white to-green-50/40">
        <SectionHeading
          eyebrow="Before collecting real responses"
          title="Research and production readiness"
          description="Resolve the remaining setup items before inviting participants to contribute real study data."
          action={<Link to="/admin/reports" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-green-800 hover:bg-green-50">Study reports <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></Link>}
        />
        {readiness.demoMode && <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><span>Demo mode is active. Keep sample records out of real research collection.</span></div>}
        <ul className="grid gap-2 md:grid-cols-2">
          {readiness.checks.map((check) => <li key={check.id} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3">
            {check.ready ? <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
            <div className="min-w-0"><p className="text-xs font-bold text-slate-800">{check.label}</p><p className="mt-1 text-[11px] leading-4 text-slate-500">{check.detail}</p></div>
          </li>)}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={handleEmailTest} disabled={testingEmail || !readiness.checks.find((item) => item.id === 'email')?.ready} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-green-200 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"><Mail aria-hidden="true" className="h-4 w-4" />{testingEmail ? 'Sending check…' : 'Send test email to my account'}</button>
          <span className="inline-flex items-center gap-1.5 px-2 text-[11px] text-slate-500"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-green-700" />Passwords and email secrets are never shown here.</span>
        </div>
      </Panel>}

      {!data && !error && null}
      {!data && error && (
        <Panel>
          <div className="flex flex-col items-center py-8 text-center">
            <Activity aria-hidden="true" className="mb-3 h-8 w-8 text-slate-300" />
            <h2 className="font-semibold text-slate-900">Dashboard data could not be loaded</h2>
            <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">Check your connection, then try again.</p>
          </div>
        </Panel>
      )}

      {data && <>
        <section aria-label="Key system metrics" className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
          <StatCard
            title="Participants"
            value={summary.totalParticipants ?? 0}
            subtitle="Respondents in the cohort"
            icon={Users}
            color="brand"
          />
          <StatCard
            title="Assessments"
            value={summary.totalAssessments ?? 0}
            subtitle="Available assessment instruments"
            icon={ClipboardList}
            color="gold"
          />
          <StatCard
            title="Completed submissions"
            value={completedAttempts}
            subtitle={totalAttempts ? (completionRate + '% of started attempts') : 'No attempts started yet'}
            icon={CheckCircle2}
            color="emerald"
          />
          <StatCard
            title="Cohort mean"
            value={hasScores && Number.isFinite(averageScore) ? averageScore.toFixed(2) + ` / ${scoreScaleMax}` : '—'}
            subtitle={hasScores ? 'Research questionnaire mean' : 'Appears after the first submission'}
            icon={Award}
            color="amber"
          />
        </section>

        <Panel className="overflow-hidden p-0">
          <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.75fr)] lg:items-center">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50 text-green-700">
                  <Activity aria-hidden="true" className="h-4 w-4" />
                </span>
                Assessment completion
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">Completed attempts compared with all attempts that have been started.</p>
              <div
                className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-label="Assessment completion rate"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={completionRate}
              >
                <div className="h-full rounded-full bg-green-700 transition-[width] duration-500" style={{ width: completionRate + '%' }} />
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x divide-slate-200 rounded-xl border border-slate-100 bg-slate-50/70 py-3">
              <div className="px-2 text-center sm:px-3">
                <p className="text-xl font-bold tabular-nums text-green-800">{completionRate}%</p>
                <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-500">Complete</p>
              </div>
              <div className="px-2 text-center sm:px-3">
                <p className="text-xl font-bold tabular-nums text-slate-900">{completedAttempts}</p>
                <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-500">Submitted</p>
              </div>
              <div className="px-2 text-center sm:px-3">
                <p className="text-xl font-bold tabular-nums text-amber-700">{inProgressAttempts}</p>
                <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-500">In progress</p>
              </div>
            </div>
          </div>
        </Panel>

        <section aria-label="Assessment analytics" className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Panel>
            <SectionHeading
              eyebrow="Cohort outcomes"
              title="Proficiency distribution"
              description="Completed submissions grouped by the system’s four proficiency bands."
            />
            <ProficiencyChart distribution={proficiencyDistribution} />
          </Panel>
          <Panel>
            <SectionHeading
              eyebrow="DigComp 2.1"
              title="Competence by domain"
              description="Average rating across the five digital competence domains on a 1–4 scale."
            />
            <AreaRadarChart areaData={areaPerformance} />
          </Panel>
        </section>

        <Panel>
          <SectionHeading
            eyebrow="Support priorities"
            title="Skills to focus on"
            description="Lowest-rated skills from completed assessments can help guide training and support."
            action={<Link to="/admin/reports" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-green-800 hover:bg-green-50">View reports <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></Link>}
          />
          {lowestRatedSkills.length ? (
            <ol className="divide-y divide-slate-100">
              {lowestRatedSkills.map((skill, index) => {
                const mean = Number(skill.mean_rating);
                const normalized = Number.isFinite(mean) ? Math.min(100, Math.max(0, (mean / 4) * 100)) : 0;
                const level = getProficiencyLevel(mean);
                return (
                  <li key={skill.id || skill.question_number} className="grid gap-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[2rem_minmax(0,1fr)_minmax(9rem,0.45fr)_auto] sm:items-center sm:gap-4">
                    <span aria-hidden="true" className="hidden h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-xs font-bold text-slate-500 sm:flex">{String(index + 1).padStart(2, '0')}</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-800">{skill.area_code || skill.area_name}</span>
                        <span className="text-[10px] text-slate-400">Question {skill.question_number}</span>
                      </div>
                      <p className="mt-1.5 text-sm font-medium leading-5 text-slate-800">{skill.question_text}</p>
                    </div>
                    <div className="flex items-center gap-3 sm:block">
                      <div className="h-1.5 min-w-20 flex-1 overflow-hidden rounded-full bg-slate-100 sm:w-full">
                        <div
                          className="h-full rounded-full bg-green-600"
                          style={{ width: normalized + '%' }}
                          role="progressbar"
                          aria-label={'Mean rating for question ' + skill.question_number}
                          aria-valuemin={0}
                          aria-valuemax={4}
                          aria-valuenow={Number.isFinite(mean) ? mean : 0}
                          aria-valuetext={Number.isFinite(mean) ? mean.toFixed(2) + ' out of 4' : 'No rating'}
                        />
                      </div>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-600 sm:hidden">{Number.isFinite(mean) ? mean.toFixed(2) : '—'} / 4</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <span className="text-[11px] text-slate-500">{skill.response_count || 0} responses</span>
                      <span className={'rounded-full px-2.5 py-1 text-[10px] font-bold ' + level.badgeColor}>{level.label}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-5 py-9 text-center">
              <p className="text-sm font-semibold text-slate-800">Training priorities will appear here</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">They are calculated after participants submit an assessment.</p>
            </div>
          )}
        </Panel>

        <Panel>
          <SectionHeading
            eyebrow="Latest activity"
            title="Recent submissions"
            description="The latest completed assessments across your system."
            action={<Link to="/admin/reports" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-green-800 hover:bg-green-50">All reports <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></Link>}
          />
          {recentSubmissions.length ? <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    <th scope="col" className="pb-3 pr-4">Participant</th>
                    <th scope="col" className="pb-3 pr-4">Assessment</th>
                    <th scope="col" className="pb-3 pr-4">Submitted</th>
                    <th scope="col" className="pb-3 pr-4">Mean</th>
                    <th scope="col" className="pb-3 pr-4">Level</th>
                    <th scope="col" className="pb-3 text-right">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentSubmissions.map((submission) => {
                    const isDigCompSat = submission.scoring_version === 'digcompsat-self-reflection-0-3.1';
                    const resultScale = isDigCompSat ? 3 : 4;
                    const level = isDigCompSat ? { label: 'Self-reflection', badgeColor: 'bg-emerald-100 text-emerald-900' } : getProficiencyLevel(submission.overall_mean);
                    return (
                      <tr key={submission.id} className="transition-colors hover:bg-slate-50/70">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2.5">
                            <PersonMark firstName={submission.first_name} lastName={submission.last_name} />
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900">{submission.first_name} {submission.last_name}</p>
                              <p className="mt-0.5 max-w-48 truncate text-[10px] text-slate-400">{submission.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="max-w-52 truncate py-3 pr-4 text-slate-600">{submission.assessment_title}</td>
                        <td className="whitespace-nowrap py-3 pr-4 text-slate-500">{formatDateTime(submission.completed_at)}</td>
                        <td className="whitespace-nowrap py-3 pr-4 font-bold tabular-nums text-slate-800">{Number(submission.overall_mean).toFixed(2)} / {resultScale}</td>
                        <td className="py-3 pr-4"><span className={'inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ' + level.badgeColor}>{level.label}</span></td>
                        <td className="py-3 text-right">
                          <Link to={'/respondent/assessments/' + submission.id + '/results'} className="inline-flex items-center gap-1 font-semibold text-green-800 hover:text-green-950 hover:underline">
                            View <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-slate-100 md:hidden">
              {recentSubmissions.map((submission) => {
                const isDigCompSat = submission.scoring_version === 'digcompsat-self-reflection-0-3.1';
                const resultScale = isDigCompSat ? 3 : 4;
                const level = isDigCompSat ? { label: 'Self-reflection', badgeColor: 'bg-emerald-100 text-emerald-900' } : getProficiencyLevel(submission.overall_mean);
                return (
                  <li key={submission.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-start gap-3">
                      <PersonMark firstName={submission.first_name} lastName={submission.last_name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900">{submission.first_name} {submission.last_name}</p>
                          <span className={'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ' + level.badgeColor}>{level.label}</span>
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-500">{submission.assessment_title}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
                          <span className="font-semibold text-slate-700">{Number(submission.overall_mean).toFixed(2)} / {resultScale}</span>
                          <span className="inline-flex items-center gap-1"><Clock3 aria-hidden="true" className="h-3 w-3" />{formatDateTime(submission.completed_at)}</span>
                        </div>
                        <Link to={'/respondent/assessments/' + submission.id + '/results'} className="mt-2 inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-green-800 hover:underline">
                          View result <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </> : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-5 py-9 text-center">
              <CheckCircle2 aria-hidden="true" className="mx-auto mb-2 h-7 w-7 text-slate-300" />
              <p className="text-sm font-semibold text-slate-800">No completed submissions yet</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Recent results will appear here as participants finish an assessment.</p>
            </div>
          )}
        </Panel>
      </>}
    </div>
  );
};

export default AdminDashboard;

