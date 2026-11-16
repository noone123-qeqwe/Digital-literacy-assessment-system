import React from 'react';
import { Inbox } from 'lucide-react';

export function AdminPanel({ title, description, action, children, className = '', eyebrow }) {
  return <section className={`admin-panel ${className}`}>
    {title && <header className="admin-panel-heading"><div>{eyebrow && <p className="admin-eyebrow">{eyebrow}</p>}<h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</header>}
    {children}
  </section>;
}
export function AdminEmpty({ title, description, action, icon: Icon = Inbox }) {
  return <div className="admin-empty"><Icon size={26} aria-hidden="true" /><h3>{title}</h3><p>{description}</p>{action}</div>;
}
export function AdminMetric({ label, value, detail, icon: Icon, tone = 'blue' }) {
  return <article className="admin-metric"><div><p>{label}</p><span className={`admin-metric-icon admin-tone-${tone}`}><Icon size={19} aria-hidden="true" /></span></div><strong>{value}</strong><p>{detail}</p></article>;
}
export function AdminNotice({ children, action, tone = 'info' }) {
  return <div className={`admin-notice admin-notice-${tone}`} role={tone === 'error' ? 'alert' : undefined}><div>{children}</div>{action}</div>;
}
