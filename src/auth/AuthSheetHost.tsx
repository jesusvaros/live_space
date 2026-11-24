import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Modal } from '../components/ui/AppPrimitives';
import { useAuth } from '../contexts/AuthContext';
import { track } from '../features/analytics/analytics';
import AuthPanel from './AuthPanel';
import { registerAuthSheet, type AuthSheetRequest } from './authSheetStore';
import { clearReturnTo } from './returnTo';

// The account sheet over the current screen (see authSheetStore.ts). Mounted once
// inside the router. When the session lands (email here, Google/Apple by
// native sheet or deep link) it closes and the person stays where they were.

const AuthSheetHost: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [request, setRequest] = useState<AuthSheetRequest | null>(null);
  const requestRef = useRef<AuthSheetRequest | null>(null);
  requestRef.current = request;

  useEffect(
    () =>
      registerAuthSheet(next => {
        if (requestRef.current) return;
        track('auth_prompt_shown', { source: next.source });
        setRequest(next);
      }),
    [],
  );

  // Signed in while open: done, back to what they were doing.
  useEffect(() => {
    if (!user || !requestRef.current) return;
    track('auth_prompt_done', { source: requestRef.current.source });
    clearReturnTo();
    setRequest(null);
  }, [user]);

  // A different screen: never leave the sheet hanging over it.
  useEffect(() => {
    setRequest(null);
  }, [location.pathname]);

  const dismiss = () => {
    if (requestRef.current) track('auth_prompt_dismissed', { source: requestRef.current.source });
    setRequest(null);
  };

  return (
    <Modal isOpen={Boolean(request) && !user} onDidDismiss={dismiss} initialBreakpoint={0.7} title="Entra en Live Space">
      <div className="max-h-[85dvh] overflow-y-auto px-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-3">
        <div className="mx-auto h-1 w-10 rounded-full bg-white/20" aria-hidden />
        {/* Closes by tapping outside the sheet (or Back): no «Ahora no» button. */}
        <p className="m-0 mt-4 font-display text-[22px] font-bold leading-tight text-app-ink text-balance">{request?.reason}</p>
        <div className="mt-5">
          <AuthPanel providerReturnPath={`${location.pathname}${location.search}`} />
        </div>
      </div>
    </Modal>
  );
};

export default AuthSheetHost;
