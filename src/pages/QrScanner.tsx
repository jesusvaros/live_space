import React, { useState } from 'react';
import { IonPage, IonContent, IonSpinner } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import AppHeader from '../components/AppHeader';
import QrScanner from '../components/QrScanner';

const QrScannerPage: React.FC = () => {
  const history = useHistory();
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const organizerAllowed = Boolean(profile && ['artist', 'venue'].includes(profile.role));

  const handleQrDetected = async (data: string) => {
    if (!user) {
      history.push('/welcome');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Parse QR data - could be event ID or full URL
      let eventId = data;
      
      // If it's a URL, extract the event ID
      if (data.includes('/event/')) {
        const match = data.match(/\/event\/([^?]+)/);
        if (match) {
          eventId = match[1];
        }
      }

      // Validate event ID format (UUID)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(eventId)) {
        throw new Error('Invalid event QR code');
      }

      // Check if event exists
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('id, name, city')
        .eq('id', eventId)
        .single();

      if (eventError || !eventData) {
        throw new Error('Event not found');
      }

      // Mark user as "going" to the event
      const { error: attendanceError } = await supabase
        .from('event_attendance')
        .upsert(
          { 
            event_id: eventId, 
            user_id: user.id, 
            status: 'going' 
          },
          { 
            onConflict: 'event_id,user_id' 
          }
        );

      if (attendanceError) {
        throw attendanceError;
      }

      // Navigate to event page
      history.push(`/event/${eventId}`);
    } catch (err: any) {
      setError(err?.message || 'Failed to process QR code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="app-layout">
          <AppHeader />
          <div className="app-screen">
            <div className="text-center fade-up">
              <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Scan QR</p>
              <h2 className="mt-2 font-display text-2xl text-slate-50">Event Check-in</h2>
              <p className="mt-2 text-sm text-slate-500">
                Scan an event QR code to automatically check in
              </p>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <IonSpinner name="crescent" />
                  <p className="mt-4 text-sm text-slate-400">Checking in...</p>
                </div>
              </div>
            )}

            {!loading && (
              <div className="mt-6">
                <QrScanner onDetected={handleQrDetected} />
              </div>
            )}

            {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}

            <div className="mt-6 text-center">
              <p className="text-xs text-slate-500">
                Point your camera at the event QR code
              </p>
            </div>

            {organizerAllowed && (
              <div className="mt-8 app-card p-4 text-left">
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
                  Organizing?
                </p>
                <h3 className="mt-2 font-display text-lg text-slate-50">Create an event</h3>
                <p className="mt-2 text-sm text-slate-500">
                  Add the event first, then share moments in the timeline.
                </p>
                <button
                  type="button"
                  className="app-button app-button--block mt-4"
                  onClick={() => history.push('/create-event', { from: '/tabs/qr-scanner' })}
                >
                  Create event
                </button>
              </div>
            )}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default QrScannerPage;
