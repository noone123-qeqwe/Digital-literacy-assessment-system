import React, { useId } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/useAuth';
import { useKnowledgeData, displayDate } from './knowledgeClient';
import './Knowledge.css';

export function KnowledgePage({ title, description, children, action, eyebrow = 'Digital literacy', loading, error, reload, className = '' }) {
  return <div className={`kq-page ${className}`}>
    <header className="kq-heading"><div><p className="kq-eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</header>
    {loading ? <div className="kq-card kq-state" role="status"><RefreshCw aria-hidden="true" size={24} />Loading your information…</div>
      : error ? <div className="kq-card kq-state" role="alert"><p>{error}</p><button className="kq-button" onClick={reload}>Try again</button></div> : children}
  </div>;
}
export function Field({ label, children, help }) {
  const id = useId();
  const control = React.isValidElement(children) ? React.cloneElement(children, {
    'aria-labelledby': children.props['aria-labelledby'] || `${id}-label`,
    'aria-describedby': [children.props['aria-describedby'], help ? `${id}-help` : ''].filter(Boolean).join(' ') || undefined,
  }) : children;
  return <label className="kq-field"><span id={`${id}-label`}>{label}</span>{control}{help && <small id={`${id}-help`}>{help}</small>}</label>;
}
export function Empty({ children = 'No records match your filters.' }) { return <div className="kq-empty">{children}</div>; }
export function ResearchLink({ to, children = 'Open research assessments' }) { return <Link className="kq-button kq-button-secondary" to={to}>{children}<ArrowRight size={16} aria-hidden="true" /></Link>; }
export function LevelBadge({ level }) { return <span className={`kq-badge ${['Advanced', 'Proficient'].includes(level) ? 'kq-badge-success' : level === 'Needs Improvement' ? 'kq-badge-warning' : ''}`}>{level}</span>; }

export function KnowledgeStats({ summary, student = false }) {
  const values = student ? [['Assigned assessments', summary.totalAssessments], ['Submitted', summary.completed], ['Pending', summary.pending], ['Average score', summary.average === null ? '—' : `${summary.average}%`]]
    : [['Registered students', summary.registeredStudents], ['Total assessments', summary.totalAssessments], ['Submitted', summary.completed], ['Pending', summary.pending], ['Average score', summary.average === null ? '—' : `${summary.average}%`]];
  return <section className="kq-stats" aria-label="Knowledge assessment summary">{values.map(([label, value]) => <article key={label} className="kq-card"><p>{label}</p><strong>{value ?? 0}</strong></article>)}</section>;
}
export function KnowledgeCharts({ data }) {
  const colors = ['#006b3c', '#0e7490', '#7c3aed', '#d97706', '#e11d48'];
  const total = data.distribution.reduce((sum, item) => sum + item.count, 0);
  const stops = data.distribution.map((item, index) => {
    const begin = total ? data.distribution.slice(0, index).reduce((sum, entry) => sum + entry.count, 0) / total * 100 : 0;
    const end = begin + (total ? item.count / total * 100 : 0);
    return `${colors[index]} ${begin}% ${end}%`;
  });
  return <section className="kq-two-columns">
    <article className="kq-card"><div className="kq-section-title"><div><p className="kq-eyebrow">Skill insights</p><h2>Category performance</h2></div><span className="kq-badge">Weighted points</span></div>
      {data.categories.length ? <div className="kq-bars">{data.categories.map((category) => <div key={category.id}><div><span>{category.name}</span><strong>{category.percentage}%</strong></div><meter min="0" max="100" value={category.percentage} aria-label={`${category.name}: ${category.percentage}%`} /></div>)}</div> : <Empty>Complete an assessment to see category performance.</Empty>}
    </article>
    <article className="kq-card"><p className="kq-eyebrow">Achievement overview</p><h2>Digital literacy levels</h2><div className="kq-distribution">
      <div className="kq-donut" role="img" aria-label={`${total} scored student-assessment results; level counts listed beside the chart.`} style={{ background: total ? `conic-gradient(${stops.join(',')})` : '#e2e8f0' }}><div><strong>{total}</strong><span>results</span></div></div>
      <ul>{data.distribution.map((item, index) => <li key={item.level}><i style={{ background: colors[index] }} /><span>{item.level}</span><strong>{item.count}</strong></li>)}</ul>
    </div><p className="kq-note">90+ Advanced · 80+ Proficient · 70+ Developing · 60+ Beginner · below 60 Needs Improvement.</p></article>
  </section>;
}

export function KnowledgePulse({ student = false }) {
  const { user } = useAuth();
  const state = useKnowledgeData(['/knowledge/overview']);
  const overview = state.data[0];
  const base = student ? '/respondent' : user.role === 'assessor' ? '/assessor' : '/admin';
  return <section className={`kq-page kq-dashboard-pulse ${student ? 'kq-student-pulse' : ''}`}>
    {student ? <div className="kq-student-summary-heading"><h2>Your assessments</h2><Link to={`${base}/knowledge`}>View all<ArrowRight aria-hidden="true" size={16} /></Link></div> : <div className="kq-hero"><div><p className="kq-eyebrow">Your digital learning hub</p><h2>Welcome to the Digital Literacy Assessment System!</h2><p>Assess your knowledge, discover strengths, and build the skills you need.</p></div><Link className="kq-button" to={`${base}/knowledge`}>Manage assessments<ArrowRight aria-hidden="true" size={17} /></Link></div>}
    {overview && <KnowledgeStats summary={overview.summary} student={student} />}
    {overview?.summary.expired > 0 && <p className="kq-note">{overview.summary.expired} assessment attempt{overview.summary.expired === 1 ? '' : 's'} ended because time expired. Saved scores remain in your result history and are separate from submitted completions.</p>}
    {state.error && <p role="status" className="kq-note">Knowledge assessment statistics are unavailable. <button onClick={state.reload}>Retry</button></p>}
    {!student && overview && <><KnowledgeCharts data={overview} /><article className="kq-card"><div className="kq-section-title"><h2>Recent student activities</h2><Link to={`${base}/results`}>View results →</Link></div><div className="kq-activities">{overview.activities.map((activity, index) => <div key={index}><span className="kq-activity-dot" /><div><strong>{activity.first_name ? `${activity.first_name} ${activity.last_name}` : activity.action.replaceAll('_', ' ')}</strong><p>{activity.details || activity.action}</p></div><time>{displayDate(activity.created_at)}</time></div>)}</div></article></>}
    {student ? <details className="kq-score-explainer"><summary>About your scores</summary><p className="kq-note">Quiz scores use percentages. Research self-reflection scores use their own scale and are shown separately.</p></details> : <p className="kq-note">Knowledge scores use percentages. Research self-reflection scores below retain their original scale and are reported separately.</p>}
  </section>;
}
