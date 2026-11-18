import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Award, CheckCircle2, CircleAlert, ClipboardList, Clock3, Mail, RefreshCw, Users, BookOpen, HelpCircle, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { useAuth } from '../../contexts/useAuth';
import { AdminEmpty, AdminMetric, AdminNotice, AdminPanel } from '../../components/admin/AdminPrimitives';
import ResearchOverview from './ResearchOverview';
import { displayDate } from '../knowledge/knowledgeClient';
import '../knowledge/Knowledge.css';

const tabs = [['overview', 'Overview'], ['research', 'Research outcomes'], ['status', 'System readiness']];
const levelColors = ['#006b3c', '#0e7490', '#7c3aed', '#b45309', '#e11d48'];
const activityLabels = {
  knowledge_attempt_complete: 'Assessment completed', knowledge_attempt_start: 'Assessment started',
  knowledge_assessment_create: 'Assessment created', knowledge_assessment_status: 'Assessment status updated',
  knowledge_assessment_delete: 'Assessment deleted', knowledge_assign: 'Students assigned to an assessment',
  quiz_category_create: 'Category created', quiz_category_update: 'Category updated', quiz_category_delete: 'Category deleted',
  quiz_question_save: 'Question saved', quiz_question_archive: 'Question archived',
  knowledge_material_save: 'Learning material saved', knowledge_material_delete: 'Learning material deleted',
  login: 'Signed in', register: 'Account registered', email_verified: 'Email verified',
};
function activityLabel(action = '') {
  return activityLabels[action.toLowerCase()] || action.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}

function SystemStatus({ readiness, error, retry, sendEmail, testingEmail }) {
  if (!readiness) return <AdminNotice tone="error" action={<button className="admin-button" onClick={retry}>Try again</button>}>{error || 'System checks are unavailable. Try again to check the current status.'}</AdminNotice>;
  const checks = readiness.checks || [], ready = checks.filter((check) => check.ready).length;
  return <div className="admin-stack">
    <AdminNotice tone={ready < checks.length ? 'warning' : 'info'}><strong>{ready} of {checks.length} checks ready.</strong> Review outstanding items before collecting real research responses. {readiness.demoMode && 'Demo mode is active.'}</AdminNotice>
    <AdminPanel title="Research and production readiness" description="Current configuration checks. College approval and verified recovery procedures remain essential." action={<span className="admin-tag"><ShieldCheck size={14} aria-hidden="true" />Administrator only</span>}>
      <ul className="admin-readiness-list">{checks.map((check) => <li key={check.id}>{check.ready ? <CheckCircle2 className="admin-check-ready" size={20} aria-hidden="true" /> : <CircleAlert className="admin-check-pending" size={20} aria-hidden="true" />}<div><strong>{check.label}</strong><p>{check.detail}</p></div><span className={`admin-tag ${check.ready ? 'admin-tag-ready' : 'admin-tag-pending'}`}>{check.ready ? 'Ready' : 'Needs attention'}</span></li>)}</ul>
    </AdminPanel>
    <AdminPanel title="Email delivery check" description="Send a test message to your own administrator account. Provider credentials stay private.">
      <button className="admin-button admin-button-secondary" onClick={sendEmail} disabled={testingEmail || !checks.find((check) => check.id === 'email')?.ready}><Mail size={17} aria-hidden="true" />{testingEmail ? 'Sending test…' : 'Send test email'}</button>
    </AdminPanel>
  </div>;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState('overview');
  const [overview, setOverview] = useState(null), [readiness, setReadiness] = useState(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [statusError, setStatusError] = useState('');
  const [revision, setRevision] = useState(0), [testingEmail, setTestingEmail] = useState(false), [updatedAt, setUpdatedAt] = useState(null);
  const tabRefs = useRef([]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([api.get('/knowledge/overview', { signal: controller.signal }), api.get('/system/readiness', { signal: controller.signal })]).then(([stats, status]) => {
      if (controller.signal.aborted) return;
      if (stats.status === 'fulfilled' && stats.value.data.success) { setOverview(stats.value.data.data); setError(''); setUpdatedAt(new Date()); }
      else setError('The latest overview could not be loaded. Check your connection and try again.');
      if (status.status === 'fulfilled' && status.value.data.success) { setReadiness(status.value.data.data); setStatusError(''); }
      else { setReadiness(null); setStatusError('Readiness checks could not be loaded.'); }
      setLoading(false);
    });
    return () => controller.abort();
  }, [revision]);
  const refresh = () => { setLoading(true); setRevision((value) => value + 1); };
  const sendEmail = async () => {
    setTestingEmail(true);
    try { const response = await api.post('/system/readiness/test-email'); toast.success(response.data.message || 'Test email sent.'); }
    catch (requestError) { toast.error(requestError.response?.data?.message || 'Could not send the test email.'); }
    finally { setTestingEmail(false); refresh(); }
  };
  const onTabKey = (event, index) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault(); setTab(tabs[next][0]); tabRefs.current[next]?.focus();
  };
  const summary = overview?.summary || {}, categories = overview?.categories || [], distribution = overview?.distribution || [];
  const total = distribution.reduce((sum, entry) => sum + entry.count, 0);
  const stops = distribution.map((entry, index) => {
    const start = total ? distribution.slice(0, index).reduce((sum, item) => sum + item.count, 0) / total * 100 : 0;
    return `${levelColors[index % levelColors.length]} ${start}% ${start + (total ? entry.count / total * 100 : 0)}%`;
  });
  return <div className="admin-home admin-stack">
    <header className="admin-page-heading"><div><p className="admin-eyebrow">Administration / Dashboard</p><h1>Welcome back, {user?.first_name || 'Administrator'}</h1><p>Welcome to the Digital Literacy Assessment System!</p></div><div className="admin-actions"><button className="admin-button admin-button-secondary" onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />{loading ? 'Refreshing…' : 'Refresh'}</button><Link className="admin-button" to="/admin/knowledge">Manage assessments <ArrowRight size={16} aria-hidden="true" /></Link></div></header>
    <div className="admin-tab-bar"><div className="admin-tabs" role="tablist" aria-label="Dashboard views">{tabs.map(([id, label], index) => <button key={id} ref={(element) => { tabRefs.current[index] = element; }} role="tab" id={`admin-tab-${id}`} aria-controls={`admin-panel-${id}`} aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={(event) => onTabKey(event, index)}>{label}{id === 'status' && readiness?.checks?.some((check) => !check.ready) && <span className="admin-status-dot" aria-label="Outstanding setup checks" />}</button>)}</div><p className="admin-updated" role="status">{loading ? 'Updating overview…' : updatedAt ? `Updated ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</p></div>
    <div role="tabpanel" id={`admin-panel-${tab}`} aria-labelledby={`admin-tab-${tab}`} tabIndex={0} className="admin-stack admin-tab-panel">
      {tab === 'overview' && <>
        {error && <AdminNotice tone="error" action={<button className="admin-button admin-button-secondary" onClick={refresh} disabled={loading}>Try again</button>}>{error}{overview && ' Showing the last available data.'}</AdminNotice>}
        {loading && !overview ? <div className="admin-metrics" role="status" aria-label="Loading overview">{Array.from({ length: 5 }, (_, index) => <div key={index} className="admin-metric admin-skeleton"><span /><strong /><span /></div>)}</div> : overview && <>
          <section className="admin-metrics" aria-label="Knowledge assessment summary"><AdminMetric label="Registered students" value={summary.registeredStudents ?? 0} detail="Student accounts" icon={Users} /><AdminMetric label="Assessments" value={summary.totalAssessments ?? 0} detail="Knowledge assessments" icon={ClipboardList} tone="violet" /><AdminMetric label="Completed" value={summary.completed ?? 0} detail="Submitted assessments" icon={CheckCircle2} tone="teal" /><AdminMetric label="Pending" value={summary.pending ?? 0} detail="Outstanding assignments" icon={Clock3} tone="amber" /><AdminMetric label="Average score" value={summary.average == null ? '—' : `${summary.average}%`} detail="Scored knowledge results" icon={Award} /></section>
          <div className="admin-overview-grid"><AdminPanel title="Category performance" description="Points earned across completed knowledge assessments." eyebrow="Learning insights" action={<Link className="admin-text-link" to="/admin/analytics">Reports <ArrowRight size={16} aria-hidden="true" /></Link>}>
            {categories.length ? <div className="admin-category-bars">{categories.map((category, index) => <div key={category.id}><div><span className="admin-category-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span>{category.name}</span><strong>{category.percentage}%</strong></div><meter min="0" max="100" value={category.percentage} aria-label={`${category.name}: ${category.percentage}%`} /></div>)}</div> : <AdminEmpty title="Your first insights start here" description="Category performance will appear when a student completes a knowledge assessment." action={<Link className="admin-button admin-button-secondary" to="/admin/knowledge">View assessments</Link>} />}
          </AdminPanel><AdminPanel title="Digital literacy levels" description="Proficiency across completed student-assessment results." eyebrow="Achievement overview">
            <div className="admin-distribution"><div className="admin-donut" role="img" aria-label={`${total} completed results. Proficiency counts are listed below.`} style={{ background: total ? `conic-gradient(${stops.join(',')})` : '#e2ece6' }}><div><strong>{total}</strong><span>completed results</span></div></div><ul>{distribution.map((entry, index) => <li key={entry.level}><i style={{ background: levelColors[index % levelColors.length] }} aria-hidden="true" /><span>{entry.level}</span><strong>{entry.count}</strong></li>)}</ul></div><Link className="admin-button admin-button-secondary admin-full-width" to="/admin/progress">View student progress <ArrowRight size={16} aria-hidden="true" /></Link>
          </AdminPanel></div>
          <div className="admin-overview-grid"><AdminPanel title="Recent activity" description="Latest recorded actions across your system." action={<Link className="admin-text-link" to="/admin/results">Results <ArrowRight size={16} aria-hidden="true" /></Link>}>
            {overview.activities?.length ? <ul className="admin-activity-list">{overview.activities.slice(0, 5).map((entry, index) => <li key={entry.id || index}><span className="admin-activity-icon"><CheckCircle2 size={16} aria-hidden="true" /></span><div><strong>{entry.first_name ? `${entry.first_name} ${entry.last_name}` : 'System activity'}</strong><p>{activityLabel(entry.action)}</p></div><time>{displayDate(entry.created_at)}</time></li>)}</ul> : <AdminEmpty title="No recent activity" description="Student and administrator activity will appear here as the system is used." />}
          </AdminPanel><AdminPanel title="Quick actions" description="Keep your people and learning content up to date."><div className="admin-shortcuts">{[[Users, 'Manage users', 'Accounts, roles and access', '/admin/users'], [HelpCircle, 'Question bank', 'Questions and answer keys', '/admin/knowledge/questions'], [BookOpen, 'Learning materials', 'Resources for all eight categories', '/admin/materials']].map(([Icon, title, detail, path]) => <Link key={path} to={path}><span><Icon size={20} aria-hidden="true" /></span><div><strong>{title}</strong><p>{detail}</p></div><ArrowRight size={17} aria-hidden="true" /></Link>)}</div></AdminPanel></div>
          <p className="admin-footnote">Knowledge quiz scores use percentages. Open Research outcomes for the original DigComp self-reflection results.</p>
        </>}
      </>}
      {tab === 'research' && <ResearchOverview key={revision} />}
      {tab === 'status' && <SystemStatus readiness={readiness} error={statusError} retry={refresh} sendEmail={sendEmail} testingEmail={testingEmail} />}
    </div>
    {tabs.filter(([id]) => id !== tab).map(([id]) => <div key={id} role="tabpanel" id={`admin-panel-${id}`} aria-labelledby={`admin-tab-${id}`} hidden />)}
  </div>;
}
