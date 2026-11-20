import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, Doughnut } from 'react-chartjs-2';
import '../../components/charts/ChartSetup';
import api from '../../api/axios';
import { useAuth } from '../../contexts/useAuth';
import { useDemoMode } from '../../contexts/useDemoMode';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import DashboardCharacter from '../../components/dashboard/DashboardCharacter';
import { KnowledgePulse } from '../knowledge/KnowledgeCommon';
import {
  AlertCircle, ArrowRight, Award, BookOpenCheck, CalendarClock,
  CheckCircle2, ClipboardList, Clock3, FileCheck2, RefreshCw, BookOpen, TrendingUp,
} from 'lucide-react';
import { getProficiencyLevel, formatDateTime, parseStoredDate } from '../../utils/helpers';
import './RespondentDashboard.css';

function DashboardRing({ values, colors, label, animate, children }) {
  const hasValues = values.some((value) => value > 0);
  return (
    <div className="dashboard-ring" role="img" aria-label={label}>
      <Doughnut
        aria-hidden="true"
        data={{
          datasets: [{
            data: hasValues ? values : [1],
            backgroundColor: hasValues ? colors : ['#edf0ee'],
            borderWidth: 0,
            borderRadius: 4,
            spacing: 3,
          }],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          cutout: '83%',
          animation: animate ? { duration: 1200, easing: 'easeOutQuart' } : false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
        }}
      />
      <div className="dashboard-ring-center">{children}</div>
    </div>
  );
}

export const RespondentDashboard = () => {
  const { user } = useAuth();
  const { available: demoStatusAvailable, freeDemoReadOnly } = useDemoMode();
  const [assessments, setAssessments] = useState([]);
  const [myAttempts, setMyAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [activityDays, setActivityDays] = useState(7);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const fetchDashboardData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [assessmentResponse, attemptResponse] = await Promise.all([
        api.get('/assessments'), api.get('/attempts/my'),
      ]);
      setAssessments(assessmentResponse.data.data || []);
      setMyAttempts(attemptResponse.data.data || []);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'We could not load your latest dashboard information. Try again.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [assessmentResponse, attemptResponse] = await Promise.all([
          api.get('/assessments'), api.get('/attempts/my'),
        ]);
        if (!active) return;
        setAssessments(assessmentResponse.data.data || []);
        setMyAttempts(attemptResponse.data.data || []);
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.message || 'We could not load your dashboard. Please try again.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 30_000);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(motion.matches);
    motion.addEventListener('change', updateMotion);
    return () => {
      window.clearInterval(timer);
      motion.removeEventListener('change', updateMotion);
    };
  }, []);

  if (loading) return <LoadingSpinner text="Loading your dashboard…" />;

  const completedAttempts = myAttempts.filter((attempt) => attempt.status === 'completed')
    .sort((first, second) => (parseStoredDate(second.completed_at)?.getTime() || 0) - (parseStoredDate(first.completed_at)?.getTime() || 0));
  const latestResult = completedAttempts[0];
  const visibleHistory = showAllHistory ? completedAttempts : completedAttempts.slice(0, 3);
  const completedAssessmentIds = new Set(completedAttempts.map((attempt) => Number(attempt.assessment_id)));
  const progressCounts = {
    completed: assessments.filter((assessment) => completedAssessmentIds.has(Number(assessment.id))).length,
    inProgress: assessments.filter((assessment) => !completedAssessmentIds.has(Number(assessment.id)) && assessment.attempt_status === 'in_progress').length,
  };
  progressCounts.remaining = Math.max(0, assessments.length - progressCounts.completed - progressCounts.inProgress);
  const completionPercent = assessments.length ? Math.round(progressCounts.completed / assessments.length * 100) : 0;

  const pendingAssessments = assessments.filter((assessment) => {
    if (assessment.attempt_status === 'completed' && Number(assessment.attempt_count || 1) >= Number(assessment.max_attempts || 1)) return false;
    if (assessment.attempt_status === 'expired') return false;
    if (assessment.attempt_status === 'in_progress') return true;
    return !assessment.end_date || parseStoredDate(assessment.end_date)?.getTime() >= currentTime;
  });
  const assessmentPriority = (assessment) => {
    if (assessment.attempt_status === 'in_progress') return 0;
    const opensAt = parseStoredDate(assessment.start_date)?.getTime();
    return opensAt && currentTime < opensAt ? 2 : 1;
  };
  const nextAssessment = [...pendingAssessments].sort((first, second) => assessmentPriority(first) - assessmentPriority(second))[0];
  const inProgress = nextAssessment?.attempt_status === 'in_progress';
  const opensAt = parseStoredDate(nextAssessment?.start_date)?.getTime();
  const isScheduled = Boolean(nextAssessment && !inProgress && opensAt && currentTime < opensAt);
  const hasRetake = nextAssessment?.attempt_status === 'completed';
  const nextAction = inProgress ? 'Resume assessment' : hasRetake ? `Start attempt ${Number(nextAssessment.attempt_count) + 1}` : 'Start assessment';
  const nextPath = nextAssessment ? !isScheduled ? `/respondent/assessments/${nextAssessment.id}/take` : '/respondent/assessments' : '/respondent/knowledge';
  const hasResearch = assessments.length > 0 || myAttempts.length > 0;
  const profile = user?.profile;
  const profileFields = [
    Boolean(profile?.age), Boolean(profile?.sex), Boolean(profile?.municipality), Boolean(profile?.barangay),
    Boolean(profile?.junior_high_school), Boolean(profile?.junior_high_school_type),
    Boolean(profile?.senior_high_school), Boolean(profile?.senior_high_school_type), Boolean(profile?.shs_strand),
    profile?.monthly_family_income_amount !== null && profile?.monthly_family_income_amount !== undefined,
    profile?.has_computer_at_home !== null && profile?.has_computer_at_home !== undefined,
    Boolean(profile?.internet_access_type),
  ];
  const profileCompletion = Math.round(profileFields.filter(Boolean).length / profileFields.length * 100);
  const latestIsDigCompSat = latestResult?.scoring_version === 'digcompsat-self-reflection-0-3.1';
  const scoreMax = latestIsDigCompSat ? 3 : 4;
  const scoreValue = Number(latestResult?.overall_mean);
  const scorePercent = latestResult && Number.isFinite(scoreValue) ? Math.max(0, Math.min(100, scoreValue / scoreMax * 100)) : 0;
  const latestLevel = latestIsDigCompSat ? 'Self-reflection' : getProficiencyLevel(latestResult?.overall_mean).label;
  const awardsAvailable = demoStatusAvailable && !freeDemoReadOnly;
  const stats = [
    { label: 'Active questionnaires', value: pendingAssessments.length, Icon: ClipboardList, tone: 'green', path: '/respondent/assessments' },
    { label: 'Completed attempts', value: completedAttempts.length, Icon: CheckCircle2, tone: 'teal', path: '#dashboard-history' },
    { label: 'Completion awards', value: awardsAvailable ? completedAttempts.length : 0, Icon: Award, tone: 'gold', path: latestResult ? `/respondent/assessments/${latestResult.id}/results` : '/respondent/assessments' },
  ];
  const activityDates = Array.from({ length: activityDays }, (_, index) => {
    const date = new Date(currentTime);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - activityDays + index + 1);
    return date;
  });
  const eventsOnDate = (items, field, date) => items.filter((item) => parseStoredDate(item[field])?.toDateString() === date.toDateString()).length;
  const activitySeries = [
    { label: 'Assigned', data: activityDates.map((date) => eventsOnDate(assessments, 'assigned_at', date)), backgroundColor: '#e9be5c' },
    { label: 'Started', data: activityDates.map((date) => eventsOnDate(myAttempts, 'started_at', date)), backgroundColor: '#7abfa3' },
    { label: 'Completed', data: activityDates.map((date) => eventsOnDate(completedAttempts, 'completed_at', date)), backgroundColor: '#006b3c' },
  ];
  const hasActivity = activitySeries.some((series) => series.data.some((value) => value > 0));

  return (
    <div className="dlas-student-dashboard">
      {error && <div className="dashboard-error" role="alert">
        <AlertCircle aria-hidden="true" size={18} /><p>{error}</p>
        <button type="button" onClick={fetchDashboardData} disabled={refreshing}>Try again</button>
      </div>}

      <div className={`dashboard-overview ${!hasResearch ? 'dashboard-overview--welcome-only' : ''}`}>
        <section className="dashboard-welcome dashboard-enter" aria-labelledby="student-welcome">
          <div className="dashboard-welcome-copy">
            <p className="dashboard-eyebrow">Masbate Colleges</p>
            <h1 id="student-welcome">Hello, {user?.first_name || 'student'}!</h1>
            <p>Take a knowledge assessment or continue a saved attempt.</p>
            <Link className="dashboard-welcome-action" to="/respondent/knowledge">
              Browse assessments
              <ArrowRight aria-hidden="true" size={17} />
            </Link>
            {profileCompletion < 100 && <Link to="/respondent/profile" className="dashboard-profile-prompt">Complete your profile · {profileCompletion}%</Link>}
          </div>
          <DashboardCharacter />
        </section>

        {hasResearch && <section className="dashboard-card dashboard-performance dashboard-enter" aria-labelledby="dashboard-performance">
          <div className="dashboard-panel-heading">
            <h2 id="dashboard-performance">{latestIsDigCompSat ? 'Latest self-rating' : 'Latest performance'}</h2>
            <button type="button" onClick={fetchDashboardData} disabled={refreshing} aria-label="Refresh dashboard" className="dashboard-icon-button">
              <RefreshCw aria-hidden="true" size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
          <DashboardRing values={[scorePercent, 100 - scorePercent]} colors={['#006b3c', '#edf0ee']} label={latestResult ? `Latest score ${latestResult.overall_mean} out of ${scoreMax}` : 'Complete an assessment to see your score'} animate={!reducedMotion}>
            <strong>{latestResult ? scoreValue.toFixed(2) : '—'}</strong>
            <span>{latestResult ? `out of ${scoreMax}.00` : 'No result yet'}</span>
          </DashboardRing>
          <p className="dashboard-performance-label">{latestResult ? latestLevel : 'Your first result starts here'}</p>
          <Link to={latestResult ? `/respondent/assessments/${latestResult.id}/results` : '/respondent/assessments'} className="dashboard-text-link">
            {latestResult ? 'View latest result' : 'Find an assessment'} <ArrowRight aria-hidden="true" size={14} />
          </Link>
        </section>}
      </div>

      <KnowledgePulse student now={currentTime} />
      <nav className="dashboard-mobile-shortcuts" aria-label="Learning shortcuts">
        <Link to="/respondent/materials"><BookOpen aria-hidden="true" size={21} /><span>Learn</span></Link>
        <Link to="/respondent/progress"><TrendingUp aria-hidden="true" size={21} /><span>Progress</span></Link>
        <Link to="/respondent/certificates"><Award aria-hidden="true" size={21} /><span>Awards</span></Link>
      </nav>
      {hasResearch && <>
      <section aria-label="Research questionnaire overview" className="dashboard-stats">
        {stats.map(({ label, value, Icon, tone, path }, index) => (
          <Link key={label} to={path}
            onClick={path === '#dashboard-history' ? (event) => {
              event.preventDefault();
              const history = document.getElementById('dashboard-history');
              history?.focus({ preventScroll: true });
              history?.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'instant' : 'smooth' });
            } : undefined}
            className="dashboard-card dashboard-stat dashboard-enter" style={{ '--dashboard-delay': `${(index + 1) * 60}ms` }}>
            <span className={`dashboard-stat-icon dashboard-tone-${tone}`}><Icon aria-hidden="true" size={22} /></span>
            <span><span className="dashboard-stat-label">{label}</span><strong>{value}</strong></span>
            <ArrowRight className="dashboard-stat-arrow" aria-hidden="true" size={16} />
          </Link>
        ))}
      </section>

      <div className="dashboard-insights">
        <section className="dashboard-card dashboard-activity dashboard-enter" aria-labelledby="dashboard-activity">
          <div className="dashboard-panel-heading">
            <h2 id="dashboard-activity">Research activity</h2>
            <label><span className="sr-only">Activity period</span>
              <select value={activityDays} onChange={(event) => setActivityDays(Number(event.target.value))}>
                <option value={7}>Last 7 days</option><option value={14}>Last 14 days</option>
              </select>
            </label>
          </div>
          <div className="dashboard-chart-legend">
            {activitySeries.map((series) => <span key={series.label}><i style={{ background: series.backgroundColor }} />{series.label}</span>)}
          </div>
          {hasActivity ? <>
            <div className="dashboard-bar-chart" role="img" aria-label={`Assessment activity over the last ${activityDays} days. Assigned, started, and completed attempts.`}>
              <Bar aria-hidden="true"
                data={{
                  labels: activityDates.map((date) => activityDays === 7 ? date.toLocaleDateString(undefined, { weekday: 'short' }) : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
                  datasets: activitySeries.map((series) => ({ ...series, borderRadius: 4, maxBarThickness: 25 })),
                }}
                options={{
                  maintainAspectRatio: false,
                  animation: reducedMotion ? false : { duration: 850, easing: 'easeOutQuart' },
                  scales: {
                    x: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { color: '#737d77', maxRotation: 0, maxTicksLimit: 7, font: { size: 11 } } },
                    y: { stacked: true, beginAtZero: true, border: { display: false }, grid: { color: '#f0f2f0' }, ticks: { precision: 0, maxTicksLimit: 5, color: '#737d77', font: { size: 11 } } },
                  },
                  plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
                }}
              />
            </div>
            <details className="dashboard-activity-details">
              <summary>View activity numbers</summary>
              <div className="dashboard-table-scroll"><table>
                <caption className="sr-only">Recorded assessment activity by date</caption>
                <thead><tr><th scope="col">Date</th>{activitySeries.map((series) => <th key={series.label} scope="col">{series.label}</th>)}</tr></thead>
                <tbody>{activityDates.map((date, index) => <tr key={date.toISOString()}><th scope="row">{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</th>{activitySeries.map((series) => <td key={series.label}>{series.data[index]}</td>)}</tr>)}</tbody>
              </table></div>
            </details>
          </> : <div className="dashboard-empty-chart"><CalendarClock aria-hidden="true" size={30} /><p>No activity in this period</p><span>Your assigned and submitted assessments will appear here.</span></div>}
        </section>

        <section className="dashboard-card dashboard-progress dashboard-enter" aria-labelledby="dashboard-progress">
          <div className="dashboard-panel-heading"><h2 id="dashboard-progress">Research progress</h2></div>
          <div className="dashboard-progress-body">
            <DashboardRing values={[progressCounts.completed, progressCounts.inProgress, progressCounts.remaining]} colors={['#006b3c', '#7abfa3', '#e9be5c']} label={`${completionPercent}% complete. ${progressCounts.completed} completed, ${progressCounts.inProgress} in progress, ${progressCounts.remaining} remaining assessments.`} animate={!reducedMotion}>
              <strong>{completionPercent}%</strong><span>completed</span>
            </DashboardRing>
            <ul className="dashboard-progress-legend">
              <li><i className="dashboard-dot-green" /><span>Completed</span><strong>{progressCounts.completed}</strong></li>
              <li><i className="dashboard-dot-mint" /><span>In progress</span><strong>{progressCounts.inProgress}</strong></li>
              <li><i className="dashboard-dot-gold" /><span>Remaining</span><strong>{progressCounts.remaining}</strong></li>
            </ul>
          </div>
          <p className="dashboard-progress-note">{progressCounts.completed} of {assessments.length} assigned assessments completed</p>
        </section>
      </div>

      <div className="dashboard-bottom-grid">
        <section className="dashboard-card dashboard-next dashboard-enter" aria-labelledby="dashboard-next">
          <div className="dashboard-panel-heading"><h2 id="dashboard-next">Research questionnaires</h2><Link to="/respondent/assessments" className="dashboard-text-link">View all <ArrowRight aria-hidden="true" size={14} /></Link></div>
          {nextAssessment ? <>
            <span className="dashboard-next-status">{inProgress ? 'In progress' : isScheduled ? 'Scheduled' : hasRetake ? 'Retake available' : 'Ready to begin'}</span>
            <h3>{nextAssessment.title}</h3>
            <p className="dashboard-next-meta"><ClipboardList aria-hidden="true" size={15} />{nextAssessment.question_count ?? 30} questions{nextAssessment.time_limit_minutes && <><Clock3 aria-hidden="true" size={15} />{nextAssessment.time_limit_minutes} min</>}</p>
            {(isScheduled || nextAssessment.end_date) && <p className="dashboard-next-date">{isScheduled ? `Opens ${formatDateTime(nextAssessment.start_date)}` : `Due ${formatDateTime(nextAssessment.end_date)}`}</p>}
            <Link className="dashboard-primary-action" to={nextPath}>{isScheduled ? 'View schedule' : nextAction}<ArrowRight aria-hidden="true" size={16} /></Link>
          </> : <div className="dashboard-caught-up"><BookOpenCheck aria-hidden="true" size={28} /><h3>You’re all caught up</h3><p>Explore resources while you wait for your next assessment.</p><Link to="/respondent/learning" className="dashboard-text-link">Open learning resources <ArrowRight aria-hidden="true" size={14} /></Link></div>}
        </section>

        <section id="dashboard-history" tabIndex={-1} className="dashboard-card dashboard-history dashboard-enter" aria-labelledby="dashboard-history-heading">
          <div className="dashboard-panel-heading"><h2 id="dashboard-history-heading">Recent research results</h2><FileCheck2 aria-hidden="true" size={18} /></div>
          {visibleHistory.length ? <>
            <ul id="assessment-history-list">{visibleHistory.map((attempt) => (
              <li key={attempt.id}>
                <span className="dashboard-history-icon"><CheckCircle2 aria-hidden="true" size={18} /></span>
                <div><p>{attempt.assessment_title}</p><span>{formatDateTime(attempt.completed_at)}</span></div>
                <Link to={`/respondent/assessments/${attempt.id}/results`} aria-label={`View results for ${attempt.assessment_title}`} className="dashboard-result-link"><ArrowRight aria-hidden="true" size={18} /></Link>
              </li>
            ))}</ul>
            {completedAttempts.length > 3 && <button type="button" onClick={() => setShowAllHistory((value) => !value)} aria-expanded={showAllHistory} aria-controls="assessment-history-list" className="dashboard-text-link">{showAllHistory ? 'Show fewer results' : `View all ${completedAttempts.length} results`}</button>}
          </> : <div className="dashboard-caught-up"><FileCheck2 aria-hidden="true" size={28} /><p>Your submitted assessments and awards will appear here.</p></div>}
        </section>
      </div>
      </>}
    </div>
  );
};

export default RespondentDashboard;
