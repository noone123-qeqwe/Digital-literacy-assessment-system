import React, { useEffect } from 'react';
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
} from 'lucide-react';
import { useAuth } from '../../contexts/useAuth';

export const Sidebar = ({ isOpen, setIsOpen }) => {
  const { logout, isAdmin, isAssessor } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, setIsOpen]);

  const adminNav = [
    { name: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Assessments', path: '/admin/assessments', icon: ClipboardList },
    { name: 'User Management', path: '/admin/users', icon: Users },
    { name: 'Question Bank', path: '/admin/questions', icon: HelpCircle },
    { name: 'Research & Analytics', path: '/admin/reports', icon: BarChart3 },
    { name: 'Learning Resources', path: '/admin/learning', icon: BookOpen },
    { name: 'Security', path: '/security', icon: ShieldCheck },
  ];

  const assessorNav = [
    { name: 'Dashboard', path: '/assessor/dashboard', icon: LayoutDashboard },
    { name: 'Assigned Assessments', path: '/assessor/assessments', icon: ClipboardList },
    { name: 'Security', path: '/security', icon: ShieldCheck },
  ];

  const respondentNav = [
    { name: 'My Dashboard', path: '/respondent/dashboard', icon: LayoutDashboard },
    { name: 'My Assessments', path: '/respondent/assessments', icon: ClipboardList },
    { name: 'Student Profile', path: '/respondent/profile', icon: UserCheck },
    { name: 'Learning Path', path: '/respondent/learning', icon: BookOpen },
    { name: 'Help and Support', path: '/respondent/help', icon: CircleHelp },
    { name: 'Security', path: '/security', icon: ShieldCheck },
  ];

  const navItems = isAdmin ? adminNav : isAssessor ? assessorNav : respondentNav;

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
        id="main-navigation"
        aria-label="Main navigation"
        className={`fixed top-0 bottom-0 left-0 z-50 flex w-80 flex-col bg-green-950 text-white transition-transform duration-300 ease-in-out lg:w-96 lg:translate-x-0 xl:w-112 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand / Institution Header */}
        <div className="flex items-center space-x-4 border-b border-white/10 p-5 sm:p-6 2xl:p-7">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-0.5 shadow-md shadow-black/20">
            <img src="/masbate-colleges-logo.png" alt="Masbate Colleges seal" className="h-full w-full object-contain" />
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight tracking-tight text-white 2xl:text-lg">DLAS Portal</h1>
            <p className="text-[11px] font-medium text-slate-300 2xl:text-sm">Masbate Colleges · CCS</p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close navigation menu"
            className="ml-auto rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-5 py-6">
          <div className="px-3 pb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400 2xl:text-sm">
            Navigation
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setIsOpen(false)}
                className={`flex items-center space-x-3 rounded-xl px-4 py-3.5 text-sm font-semibold transition-all 2xl:py-4 2xl:text-base ${
                  isActive
                    ? 'bg-green-600 text-white shadow-sm shadow-green-500/25'
                    : 'text-slate-300 hover:bg-white/[0.07] hover:text-white'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* DigComp Framework Reference Pill */}
        <div className="m-4 rounded-xl border border-white/10 bg-white/[0.05] p-4">
          <div className="flex items-center space-x-2 text-sm font-bold text-amber-300 2xl:text-base">
            <Sparkles className="w-3.5 h-3.5" />
            <span>DigComp 2.1 Model</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-300 2xl:text-sm">
            Standardized 5-domain digital literacy competence framework.
          </p>
        </div>

        {/* Logout */}
        <div className="border-t border-white/10 p-4">
          <button
            onClick={logout}
            type="button"
            aria-label="Sign out of your account"
            className="flex min-h-11 w-full items-center space-x-3 rounded-xl px-4 py-3.5 text-left text-sm font-semibold text-slate-200 transition-colors hover:bg-rose-500/10 hover:text-rose-200 2xl:min-h-12 2xl:text-base"
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

