import React, { useState } from 'react';
import { IonPage, IonContent, IonSpinner } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { supabase } from '../lib/supabase';
import AppHeader from '../components/AppHeader';
import QrScanner from '../components/QrScanner';

const QrScannerPage: React.FC = () => {
  const history = useHistory();
  const { user } = useAuth();
  const { canCreateEvent } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
        <div className="min-h-full">
          <AppHeader />
          <div className="flex flex-col gap-4 p-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
            <div className="text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Scan</p>
              <h2 className="mt-2 font-display text-2xl font-bold text-white">Event check-in</h2>
              <p className="mt-2 text-sm text-white/55">Scan an event QR code to check in.</p>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <IonSpinner name="crescent" />
                  <p className="mt-4 text-sm text-white/55">Checking in...</p>
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
              <p className="text-xs text-white/55">Point your camera at the event QR code.</p>
            </div>

            {canCreateEvent && (
              <div className="mt-8 space-y-3 bg-white/5 p-4 text-left">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Organizing?</p>
                <h3 className="mt-2 font-display text-lg font-bold text-white">Create an event</h3>
                <p className="mt-2 text-sm text-white/55">Add the event first, then share moments in the timeline.</p>
                <button
                  type="button"
                  className="mt-4 inline-flex w-full items-center justify-center bg-white/10 px-4 py-3 text-sm font-semibold text-white"
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
