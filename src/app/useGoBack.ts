import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// True when there is an in-app page to go back to. React Router stores the
// history index in history.state; 0 means the app was opened on this page
// (cold start, deep link, QR).
export const canGoBack = () => {
  const state = window.history.state as { idx?: number } | null;
  return typeof state?.idx === 'number' && state.idx > 0;
};

// Back to the previous page; `fallback` only when there is none.
export const useGoBack = (fallback = '/tabs/events') => {
  const navigate = useNavigate();
  return useCallback(() => {
    if (canGoBack()) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [fallback, navigate]);
};
