import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ListChecks, ClipboardList, LayoutDashboard, UserRound, Ellipsis, BookOpen, TrendingUp, Award, CircleHelp, ShieldCheck, LogOut, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/useAuth';
import Modal from '../common/Modal';

const links = [
  { to: '/respondent/dashboard', label: 'Home', Icon: LayoutDashboard },
  { to: '/respondent/knowledge', label: 'Assessments', Icon: ClipboardList },
  { to: '/respondent/results', label: 'Results', Icon: ListChecks },
  { to: '/respondent/profile', label: 'Profile', Icon: UserRound },
];
const moreLinks = [
  { to: '/respondent/materials', label: 'Learning materials', detail: 'Practice and build your skills', Icon: BookOpen },
  { to: '/respondent/progress', label: 'My progress', detail: 'See how your skills are growing', Icon: TrendingUp },
  { to: '/respondent/certificates', label: 'Certificates and awards', detail: 'View your achievements', Icon: Award },
  { to: '/respondent/assessments', label: 'Research questionnaires', detail: 'Your assigned self-reflections', Icon: ClipboardList },
  { to: '/respondent/help', label: 'Help and support', detail: 'Find answers and get assistance', Icon: CircleHelp },
  { to: '/security', label: 'Account security', detail: 'Password and signed-in devices', Icon: ShieldCheck },
];

export default function MobileStudentNav() {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  const { logout } = useAuth();
  const moreActive = moreLinks.some(({ to }) => pathname === to || pathname.startsWith(`${to}/`));
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    let fullHeight = viewport.height;
    const update = () => {
      const editing = document.activeElement?.matches('textarea, input:not([type]), input[type="text"], input[type="email"], input[type="password"], input[type="search"], input[type="number"], input[type="tel"], input[type="url"]');
      if (!editing || viewport.height > fullHeight) fullHeight = viewport.height;
      setKeyboardOpen(Boolean(editing && fullHeight - viewport.height > 140));
    };
    update();
    viewport.addEventListener('resize', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => { viewport.removeEventListener('resize', update); document.removeEventListener('focusin', update); document.removeEventListener('focusout', update); };
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => { if (!media.matches) setMoreOpen(false); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return <>
    <nav className="student-mobile-nav" aria-label="Student navigation" hidden={keyboardOpen}>
      {links.map(({ to, label, Icon }) => (
        <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'student-mobile-link is-active' : 'student-mobile-link'}>
          <Icon aria-hidden="true" size={20} />
          <span>{label}</span>
        </NavLink>
      ))}
      <button type="button" className={`student-mobile-link ${moreActive || moreOpen ? 'is-active' : ''}`} onClick={() => setMoreOpen(true)} aria-label="More student options" aria-haspopup="dialog" aria-expanded={moreOpen} aria-controls="student-more-menu">
        <Ellipsis aria-hidden="true" size={21} /><span>More</span>
      </button>
    </nav>
    {createPortal(<div className="student-more-sheet"><Modal isOpen={moreOpen} onClose={() => setMoreOpen(false)} title="More options" maxWidth="max-w-md">
      <div id="student-more-menu" className="student-more-menu">
        {moreLinks.map(({ to, label, detail, Icon }) => <Link key={to} to={to} onClick={() => setMoreOpen(false)} className="student-more-item" aria-current={pathname === to ? 'page' : undefined}>
          <span className="student-more-icon"><Icon aria-hidden="true" size={21} /></span><span><strong>{label}</strong><small>{detail}</small></span><ChevronRight aria-hidden="true" size={17} />
        </Link>)}
        <button type="button" className="student-more-signout" onClick={() => { setMoreOpen(false); void logout(); }}><LogOut aria-hidden="true" size={18} />Sign out</button>
      </div>
    </Modal></div>, document.body)}
  </>;
}
