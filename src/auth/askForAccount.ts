import type { NavigateFunction } from 'react-router-dom';
import { rememberReturnTo } from './returnTo';

// Live Space never walls the app behind an account: you can look around and
// even record an upload without one. The account is asked for at the moment
// it is worth something (following, saving, liking, attending), saying why,
// and the person comes back to the same page once signed in.
export const askForAccount = (navigate: NavigateFunction, reason: string) => {
  rememberReturnTo(`${window.location.pathname}${window.location.search}`);
  navigate('/welcome', { state: { reason } });
};
