import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  HelpCircle,
  BarChart3,
  UserCheck,
  ShieldCheck,
  LogOut,
  Sparkles,
  X,
  BookOpen,
  CircleHelp,
  Layers3, Award, TrendingUp, ListChecks, ChevronDown,
} from 'lucide-react';
import { useAuth } from '../../contexts/useAuth';

export const Sidebar = ({ isOpen, setIsOpen, light = false }) => {
  const { logout, isAdmin, isAssessor } = useAuth();
  const location = useLocation();
  const sidebarRef = useRef(null);
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => {
      setIsDesktop(media.matches);
      if (media.matches) setIsOpen(false);
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [setIsOpen]);

  useEffect(() => {
    if (!isOpen || isDesktop) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => sidebarRef.current?.querySelector('button')?.focus());
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
      if (event.key !== 'Tab') return;
      const focusable = Array.from(sidebarRef.current?.querySelectorAll('a[href], button:not(:disabled), summary') || []).filter((element) => element.getClientRects().length);
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus?.();
    };
  }, [isOpen, isDesktop, setIsOpen]);

  const adminNav = [
    { name: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'User Management', path: '/admin/users', icon: Users },
    { name: 'Assessment Categories', path: '/admin/categories', icon: Layers3 },
    { name: 'Question Bank', path: '/admin/knowledge/questions', icon: HelpCircle },
    { name: 'Assessment Management', path: '/admin/knowledge', icon: ClipboardList },
    { name: 'Assessment Results', path: '/admin/results', icon: ListChecks },
    { name: 'Reports and Analytics', path: '/admin/analytics', icon: BarChart3 },
    { name: 'Learning Materials', path: '/admin/materials', icon: BookOpen },
    { name: 'Progress Tracking', path: '/admin/progress', icon: TrendingUp },
    { name: 'Certificates', path: '/admin/certificates', icon: Award },
    { name: 'Settings', path: '/security', icon: ShieldCheck },
  ];

  const assessorNav = [
    { name: 'Dashboard', path: '/assessor/dashboard', icon: LayoutDashboard },
    { name: 'Assigned Assessments', path: '/assessor/assessments', icon: ClipboardList },
    { name: 'Knowledge Assessments', path: '/assessor/knowledge', icon: Layers3 },
    { name: 'Assessment Results', path: '/assessor/results', icon: ListChecks },
    { name: 'Reports and Analytics', path: '/assessor/analytics', icon: BarChart3 },
    { name: 'Progress Tracking', path: '/assessor/progress', icon: TrendingUp },
    { name: 'Certificates', path: '/assessor/certificates', icon: Award },
    { name: 'Security', path: '/security', icon: ShieldCheck },
  ];

  const respondentNav = [
    { name: 'Student Dashboard', path: '/respondent/dashboard', icon: LayoutDashboard },
    { name: 'Take Assessment', path: '/respondent/knowledge', icon: ClipboardList },
    { name: 'My Results', path: '/respondent/results', icon: ListChecks },
    { name: 'Learning Materials', path: '/respondent/materials', icon: BookOpen },
    { name: 'My Progress', path: '/respondent/progress', icon: TrendingUp },
    { name: 'My Certificates', path: '/respondent/certificates', icon: Award },
    { name: 'My Profile', path: '/respondent/profile', icon: UserCheck },
    { name: 'Help and Support', path: '/respondent/help', icon: CircleHelp },
    { name: 'Security', path: '/security', icon: ShieldCheck },
  ];

  const navItems = isAdmin ? adminNav : isAssessor ? assessorNav : respondentNav;
  const adminGroups = [
    ['Workspace', [0, 1]],
    ['Assessment studio', [4, 2, 3, 7]],
    ['Outcomes', [5, 6, 8, 9]],
    ['Account', [10]],
  ];
  const researchNav = [
    { name: 'Research assessments', path: '/admin/assessments', icon: ClipboardList },
    { name: 'Research questions', path: '/admin/questions', icon: HelpCircle },
    { name: 'Research reports', path: '/admin/reports', icon: BarChart3 },
    { name: 'Research learning paths', path: '/admin/learning', icon: BookOpen },
  ];
  const renderAdminLink = (item) => {
    const Icon = item.icon;
    const active = location.pathname === item.path || (item.path !== '/admin/knowledge' && location.pathname.startsWith(`${item.path}/`));
    return <NavLink key={item.path} to={item.path} end={item.path === '/admin/knowledge'} onClick={() => setIsOpen(false)} className={`admin-nav-link ${active ? 'is-active' : ''}`}><Icon aria-hidden="true" /><span>{item.name}</span></NavLink>;
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        ref={sidebarRef}
        id="main-navigation"
        aria-label="Main navigation"
        role={!isDesktop && isOpen ? 'dialog' : undefined}
        aria-modal={!isDesktop && isOpen ? true : undefined}
        inert={!isDesktop && !isOpen ? true : undefined}
        className={`workspace-sidebar fixed top-0 bottom-0 left-0 z-50 flex w-80 flex-col transition-transform duration-300 ease-in-out lg:w-96 lg:translate-x-0 xl:w-112 ${light ? 'dashboard-sidebar bg-white text-slate-800' : 'bg-green-950 text-white'} ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand / Institution Header */}
        <div className={`sidebar-brand flex items-center space-x-4 border-b p-5 sm:p-6 2xl:p-7 ${light ? 'border-slate-100' : 'border-white/10'}`}>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-0.5 shadow-md shadow-black/20">
            <img src="/masbate-colleges-logo-login.webp" alt="Masbate Colleges seal" className="h-full w-full object-contain" />
          </div>
          <div>
            <p className={`text-base font-bold leading-tight tracking-tight 2xl:text-lg ${light ? 'text-green-950' : 'text-white'}`}>DLAS Portal</p>
            <p className={`text-[11px] font-medium 2xl:text-sm ${light ? 'text-slate-500' : 'text-slate-300'}`}>Masbate Colleges · CCS</p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close navigation menu"
            className={`ml-auto rounded-lg p-2 transition-colors lg:hidden ${light ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-900' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="sidebar-links min-h-0 flex-1 space-y-1.5 overflow-y-auto px-5 py-6">
          {!light && !isAdmin && <div className="px-3 pb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400 2xl:text-sm">
            Navigation
          </div>}
          {isAdmin ? <>{adminGroups.map(([label, indices]) => <section className="admin-nav-group" key={label} aria-label={label}><h2 className="admin-nav-heading">{label}</h2>{indices.map((index) => renderAdminLink(adminNav[index]))}</section>)}<details className="admin-research-nav" open={researchNav.some((item) => location.pathname.startsWith(item.path)) || undefined}><summary>Research tools <ChevronDown size={16} aria-hidden="true" /></summary>{researchNav.map(renderAdminLink)}</details></> : navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || (item.path !== '/admin/knowledge' && item.path !== '/assessor/knowledge' && location.pathname.startsWith(`${item.path}/`));

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setIsOpen(false)}
                className={`flex items-center space-x-3 rounded-xl px-4 py-3.5 text-sm font-semibold transition-all 2xl:py-4 2xl:text-base ${
                  light
                    ? isActive ? 'bg-green-50 text-green-800' : 'text-slate-600 hover:bg-slate-50 hover:text-green-800'
                    : isActive
                    ? 'bg-green-600 text-white shadow-sm shadow-green-500/25'
                    : 'text-slate-300 hover:bg-white/[0.07] hover:text-white'
                }`}
              >
                <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${light ? isActive ? 'text-green-700' : 'text-slate-500' : isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* DigComp Framework Reference Pill */}
        <div className={`sidebar-framework m-4 rounded-xl border p-4 ${light ? 'border-green-100 bg-green-50' : 'border-white/10 bg-white/[0.05]'}`}>
          <div className={`flex items-center space-x-2 text-sm font-bold 2xl:text-base ${light ? 'text-green-800' : 'text-amber-300'}`}>
            <Sparkles className="w-3.5 h-3.5" />
            <span>Learn. Assess. Improve.</span>
          </div>
          <p className={`mt-1 text-xs leading-relaxed 2xl:text-sm ${light ? 'text-slate-600' : 'text-slate-300'}`}>
            Knowledge quizzes and DigComp research assessments, with distinct scoring.
          </p>
        </div>

        {/* Logout */}
        <div className={`sidebar-logout border-t p-4 ${light ? 'border-slate-100' : 'border-white/10'}`}>
          <button
            onClick={logout}
            type="button"
            aria-label="Sign out of your account"
            className={`flex min-h-11 w-full items-center space-x-3 rounded-xl px-4 py-3.5 text-left text-sm font-semibold transition-colors 2xl:min-h-12 2xl:text-base ${light ? 'text-slate-600 hover:bg-rose-50 hover:text-rose-800' : 'text-slate-200 hover:bg-rose-500/10 hover:text-rose-200'}`}
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;

