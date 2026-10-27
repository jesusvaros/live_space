import { useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { listenForNudgeTaps, syncMomentNudges } from './momentNudge';

// Mounted once inside the router. Opens /subir/sugerido when a morning nudge
// is tapped and runs the silent gallery check on app open and resume.
const MomentNudges = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => listenForNudgeTaps(path => navigate(path)), [navigate]);

  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return undefined;
    void syncMomentNudges(userId);
    const listener = CapacitorApp.addListener('resume', () => {
      void syncMomentNudges(userId);
    });
    return () => {
      void listener.then(handle => handle.remove());
    };
  }, [userId]);

  return null;
};

export default MomentNudges;
