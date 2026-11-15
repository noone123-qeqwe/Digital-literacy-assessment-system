import { useContext } from 'react';
import { DemoModeContext } from './DemoModeContextStore';

export const useDemoMode = () => useContext(DemoModeContext);
