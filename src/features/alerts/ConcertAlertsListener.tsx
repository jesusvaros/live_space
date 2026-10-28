import { useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { listenForAlertTaps, syncConcertAlerts } from './concertAlerts';

// Mounted once inside the router. Announces new concerts of what the user
// follows on app open and resume, and opens the concert when tapped.
const ConcertAlertsListener = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const subjectId = profile?.subject_id ?? null;

  useEffect(() => listenForAlertTaps(path => navigate(path)), [navigate]);

  useEffect(() => {
    if (!subjectId || !Capacitor.isNativePlatform()) return undefined;
    void syncConcertAlerts(subjectId);
    const listener = CapacitorApp.addListener('resume', () => {
      void syncConcertAlerts(subjectId);
    });
    return () => {
      void listener.then(handle => handle.remove());
    };
  }, [subjectId]);

  return null;
};

export default ConcertAlertsListener;
