import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { BookOpen, ClipboardList, LayoutDashboard, UserRound } from 'lucide-react';

const links = [
  { to: '/respondent/dashboard', label: 'Home', Icon: LayoutDashboard },
  { to: '/respondent/assessments', label: 'Assessments', Icon: ClipboardList },
  { to: '/respondent/learning', label: 'Learn', Icon: BookOpen },
  { to: '/respondent/profile', label: 'Profile', Icon: UserRound },
];

export default function MobileStudentNav() {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    const update = () => setKeyboardOpen(viewport.height < window.innerHeight * 0.75);
    viewport.addEventListener('resize', update);
    return () => viewport.removeEventListener('resize', update);
  }, []);

  return (
    <nav className="student-mobile-nav" aria-label="Student navigation" hidden={keyboardOpen}>
      {links.map(({ to, label, Icon }) => (
        <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'student-mobile-link is-active' : 'student-mobile-link'}>
          <Icon aria-hidden="true" size={20} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
