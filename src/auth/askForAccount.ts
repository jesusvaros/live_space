import type { NavigateFunction } from 'react-router-dom';
import { openAuthSheet } from './authSheetStore';
import { rememberReturnTo } from './returnTo';

// Live Space never walls the app behind an account: you can look around and
// even record an upload without one. The account is asked for at the moment
// it is worth something (following, saving, liking, attending), saying why,
// in a sheet over the same screen; Google/Apple and email links come back to
// this page too (returnTo).
export const askForAccount = (navigate: NavigateFunction, reason: string, source = 'action') => {
  rememberReturnTo(`${window.location.pathname}${window.location.search}`);
  if (openAuthSheet({ reason, source })) return;
  navigate('/welcome', { state: { reason } });
};
