import { createContext } from 'react';

export const DemoModeContext = createContext({
  available: false,
  demoMode: false,
  freeDemoReadOnly: false,
  loading: true,
});
