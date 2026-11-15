import React from 'react';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../../contexts/useAuth';
import { useLocation } from 'react-router-dom';

const routeTitles = [
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

export const Navbar = ({ setIsSidebarOpen, isSidebarOpen }) => {
  const { user, profilePictureUrl } = useAuth();
  const location = useLocation();
  const pageTitle = routeTitles.find(([path]) => location.pathname.startsWith(path))?.[1] || 'Assessment';
  const roleLabel = user?.role === 'respondent' ? 'Student' : user?.role === 'assessor' ? 'Teacher / Assessor' : 'Administrator';

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 py-5 backdrop-blur-md sm:px-8 2xl:px-12 2xl:py-7">
      <div className="flex items-center space-x-4 sm:space-x-5">
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          type="button"
          aria-label={isSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-controls="main-navigation"
          aria-expanded={isSidebarOpen}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 lg:hidden"
        >
          {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <div>
          <h2 className="text-base font-bold tracking-tight text-slate-900 sm:text-lg 2xl:text-xl">{pageTitle}</h2>
          <p className="hidden text-xs text-slate-500 sm:block 2xl:text-sm">Digital Literacy Assessment System · Masbate Colleges</p>
        </div>
      </div>

      <div className="flex items-center space-x-3 sm:space-x-4 2xl:space-x-6">
        <div className="hidden items-center rounded-full border border-green-100 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 sm:flex 2xl:px-4 2xl:py-2 2xl:text-sm">
          <span aria-hidden="true" className="mr-2 h-1.5 w-1.5 rounded-full bg-green-600"></span>
          {roleLabel} workspace
        </div>

        {/* User Mini Profile */}
        <div className="flex items-center space-x-3 border-l border-slate-200 pl-3 2xl:space-x-4 2xl:pl-4">
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
        </div>
      </div>
    </header>
  );
};

export default Navbar;

