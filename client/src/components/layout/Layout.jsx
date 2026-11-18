import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigationType } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import { useAuth } from '../../contexts/useAuth';
import './MobileWorkspace.css';
import './BlueWorkspace.css';
import './AdminWorkspace.css';
import './StudentMobile.css';

export const Layout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const isStudentDashboard = pathname === '/respondent/dashboard';
  const isStudent = user?.role === 'respondent';
  useEffect(() => {
    if (isStudent && navigationType !== 'POP') window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname, isStudent, navigationType]);

  return (
    <div className={`dlas-blue-workspace flex min-h-screen bg-slate-50 ${user?.role === 'admin' ? 'dlas-admin-workspace' : ''} ${isStudentDashboard ? 'dlas-dashboard-shell' : ''} ${isStudent ? 'dlas-student-workspace' : ''}`}>
      <a href="#main-content" className="sr-only fixed left-3 top-3 z-[60] rounded-lg bg-white px-4 py-3 text-sm font-bold text-green-900 shadow-lg focus:not-sr-only focus:outline focus:outline-2 focus:outline-green-700">Skip to main content</a>
      {/* Sidebar navigation */}
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />

      {/* Main Content Area */}
      <div className="dlas-workspace-content flex min-h-screen min-w-0 flex-1 flex-col lg:pl-96 xl:pl-112">
        <Navbar setIsSidebarOpen={setIsSidebarOpen} isSidebarOpen={isSidebarOpen} dashboardMode={isStudentDashboard} />

        <main id="main-content" tabIndex="-1" className="dlas-workspace-main mx-auto w-full max-w-[2560px] flex-1 px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-8 focus:outline-none">
          <Outlet />
        </main>

        <footer className="dlas-workspace-footer border-t border-slate-200/80 bg-white/80 px-4 py-4 text-center text-[11px] leading-5 text-slate-500 sm:px-6">
          Digital Literacy Assessment System <span aria-hidden="true">·</span> College of Computer Studies, Masbate Colleges <span aria-hidden="true">·</span> DigComp 2.1
        </footer>
      </div>
    </div>
  );
};

export default Layout;

