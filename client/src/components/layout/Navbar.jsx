import React, { useEffect, useState } from 'react';
import { Menu, X, CircleHelp } from 'lucide-react';
import { useAuth } from '../../contexts/useAuth';
import { Link, useLocation } from 'react-router-dom';

const routeTitles = [
  ['/admin/knowledge/questions', 'Knowledge question bank'],
  ['/admin/knowledge', 'Assessment management'],
  ['/admin/categories', 'Assessment categories'],
  ['/admin/results', 'Assessment results'],
  ['/admin/analytics', 'Reports and analytics'],
  ['/admin/progress', 'Progress tracking'],
  ['/admin/certificates', 'Certificates'],
  ['/admin/materials', 'Learning materials'],
  ['/assessor/knowledge', 'Knowledge assessments'],
  ['/assessor/results', 'Assessment results'],
  ['/assessor/analytics', 'Reports and analytics'],
  ['/assessor/progress', 'Progress tracking'],
  ['/assessor/certificates', 'Certificates'],
  ['/respondent/knowledge/attempts', 'Knowledge assessment'],
  ['/respondent/knowledge', 'Take assessment'],
  ['/respondent/results', 'My results'],
  ['/respondent/progress', 'My progress'],
  ['/respondent/certificates', 'My certificates'],
  ['/respondent/materials', 'Learning materials'],
  ['/security', 'Account settings'],
  ['/admin/dashboard', 'Dashboard'],
  ['/admin/assessments', 'Assessments'],
  ['/admin/users', 'User management'],
  ['/admin/questions', 'Question bank'],
  ['/admin/reports', 'Research & analytics'],
  ['/admin/learning', 'Learning resources'],
  ['/assessor/dashboard', 'Dashboard'],
  ['/assessor/assessments', 'Assigned assessments'],
  ['/respondent/dashboard', 'My dashboard'],
  ['/respondent/assessments/', 'Assessment details'],
  ['/respondent/assessments', 'My assessments'],
  ['/respondent/profile', 'Student profile'],
  ['/respondent/learning', 'My learning path'],
  ['/respondent/help', 'Help and support'],
];

export const Navbar = ({ setIsSidebarOpen, isSidebarOpen, dashboardMode = false }) => {
  const { user, profilePictureUrl } = useAuth();
  const location = useLocation();
  const [dashboardDate, setDashboardDate] = useState(() => new Date());
  useEffect(() => {
    if (!dashboardMode) return undefined;
    const timer = window.setInterval(() => {
      setDashboardDate(new Date());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [dashboardMode]);
  const pageTitle = routeTitles.find(([path]) => location.pathname.startsWith(path))?.[1] || 'Assessment';
  const dashboardLongDate = dashboardDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const dashboardShortDate = dashboardDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const roleLabel = user?.role === 'respondent' ? 'Student' : user?.role === 'assessor' ? 'Teacher / Assessor' : 'Administrator';
  const isStudent = user?.role === 'respondent';
  const takingAssessment = /^\/respondent\/(assessments\/\d+\/take|knowledge\/attempts\/\d+)\/?$/.test(location.pathname);
  const profileLink = user?.role === 'admin' || (isStudent && !takingAssessment);
  const ProfileWrapper = profileLink ? Link : 'div';

  return (
    <header className={`workspace-navbar sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 py-5 backdrop-blur-md sm:px-8 2xl:px-12 2xl:py-7 ${dashboardMode ? 'dashboard-navbar' : ''}`}>
      <div className="flex items-center space-x-4 sm:space-x-5">
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          type="button"
          aria-label={isSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-controls="main-navigation"
          aria-expanded={isSidebarOpen}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 lg:hidden"
        >
          {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <div>
          <h2 className="text-base font-bold tracking-tight text-slate-900 sm:text-lg 2xl:text-xl">{dashboardMode ? 'Dashboard' : pageTitle}</h2>
          <p className={`text-xs text-slate-500 2xl:text-sm ${dashboardMode ? '' : 'hidden sm:block'}`}>{dashboardMode ? <><span className="sm:hidden">{dashboardShortDate}</span><span className="hidden sm:inline">{dashboardLongDate}</span></> : 'Digital Literacy Assessment System · Masbate Colleges'}</p>
        </div>
      </div>

      <div className="flex items-center space-x-3 sm:space-x-4 2xl:space-x-6">
        {dashboardMode && <Link to="/respondent/help" aria-label="Open help and support" className="hidden h-11 w-11 items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm hover:text-green-700 sm:flex"><CircleHelp aria-hidden="true" className="h-5 w-5" /></Link>}
        {!dashboardMode && <div className="hidden items-center rounded-full border border-green-100 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 sm:flex 2xl:px-4 2xl:py-2 2xl:text-sm">
          <span aria-hidden="true" className="mr-2 h-1.5 w-1.5 rounded-full bg-green-600"></span>
          {roleLabel} workspace
        </div>}

        {/* User Mini Profile */}
        <ProfileWrapper {...(profileLink ? { to: isStudent ? '/respondent/profile' : '/security', 'aria-label': isStudent ? 'Open your profile' : 'Open account settings' } : {})} className={user?.role === 'admin' ? 'admin-account-link' : 'student-profile-link flex items-center space-x-3 border-l border-slate-200 pl-3 2xl:space-x-4 2xl:pl-4'}>
          <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-900 text-sm font-bold text-white shadow-xs ring-2 ring-slate-100 2xl:h-12 2xl:w-12 2xl:text-base">
            {profilePictureUrl ? (
              <img src={profilePictureUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <>{user?.first_name?.[0] || ''}{user?.last_name?.[0] || ''}</>
            )}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-sm font-semibold leading-none text-slate-800 2xl:text-base">
              {user?.first_name} {user?.last_name}
            </p>
            <p className="mt-1 text-xs capitalize text-slate-500 2xl:text-sm">{roleLabel}</p>
          </div>
        </ProfileWrapper>
      </div>
    </header>
  );
};

export default Navbar;

