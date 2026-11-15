import React, { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import api from '../../api/axios';

export const DemoModeIndicator = () => {
  const { pathname } = useLocation();
  const [demoMode, setDemoMode] = useState(false);
  const [freeDemoReadOnly, setFreeDemoReadOnly] = useState(false);
  useEffect(() => {
    api.get('/system/status')
      .then((response) => {
        setDemoMode(Boolean(response.data?.data?.demoMode));
        setFreeDemoReadOnly(Boolean(response.data?.data?.freeDemoReadOnly));
      })
      .catch(() => setDemoMode(false));
  }, []);
  if (!demoMode || pathname === '/login' || pathname === '/register') return null;
  return (
    <div role="status" className="fixed right-3 top-3 z-[100] inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950 shadow-lg sm:right-5 sm:top-5 sm:text-sm">
      <FlaskConical aria-hidden="true" className="h-4 w-4 text-amber-700" />
      <span>{freeDemoReadOnly ? 'FREE DEMO · Read only · Sample data' : 'DEMO ONLY · Sample data'}</span>
    </div>
  );
};

export default DemoModeIndicator;
