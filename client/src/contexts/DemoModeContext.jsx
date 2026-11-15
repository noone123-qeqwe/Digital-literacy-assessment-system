import React, { useEffect, useState } from 'react';
import api from '../api/axios';
import { DemoModeContext } from './DemoModeContextStore';

export const DemoModeProvider = ({ children }) => {
  const [status, setStatus] = useState({
    available: false,
    demoMode: false,
    freeDemoReadOnly: false,
    loading: true,
  });

  useEffect(() => {
    let active = true;

    api.get('/system/status')
      .then((response) => {
        if (!active) return;
        const data = response.data?.data;
        setStatus({
          available: Boolean(data),
          demoMode: Boolean(data?.demoMode),
          freeDemoReadOnly: Boolean(data?.freeDemoReadOnly),
          loading: false,
        });
      })
      .catch(() => {
        if (active) setStatus({ available: false, demoMode: false, freeDemoReadOnly: false, loading: false });
      });

    return () => { active = false; };
  }, []);

  return <DemoModeContext.Provider value={status}>{children}</DemoModeContext.Provider>;
};
