import React, { useEffect, useRef } from 'react';
import { IonContent, IonPage, IonSpinner } from '@ionic/react';
import { Redirect, useHistory, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import CreateEventModal from '../components/event/CreateEventModal';
import { ManagedEntity, Profile } from '../lib/types';

const CreateEventPage: React.FC = () => {
  const history = useHistory();
  const location = useLocation<{ from?: string }>();
  const { user, profile, loading: authLoading } = useAuth();
  const { canCreateEvent, activeWorkspace, loading: workspaceLoading, ready: workspaceReady } = useWorkspace();
  const lastCanCreateRef = useRef<boolean | null>(null);
  const lastWorkspaceRef = useRef<ManagedEntity | null>(null);
  const lastProfileRef = useRef<Profile | null>(null);
  const fallbackRoute = location.state?.from || '/tabs/events';

  useEffect(() => {
    if (workspaceReady) {
      lastCanCreateRef.current = canCreateEvent;
    }
  }, [workspaceReady, canCreateEvent]);

  useEffect(() => {
    if (!user) {
      lastCanCreateRef.current = null;
      lastWorkspaceRef.current = null;
      lastProfileRef.current = null;
    }
  }, [user]);

  useEffect(() => {
    if (activeWorkspace) {
      lastWorkspaceRef.current = activeWorkspace;
    }
  }, [activeWorkspace]);

  useEffect(() => {
    if (profile) {
      lastProfileRef.current = profile;
    }
  }, [profile]);

  const canCreateStable = workspaceReady ? canCreateEvent : (lastCanCreateRef.current ?? false);
  const stableWorkspace = activeWorkspace ?? lastWorkspaceRef.current;
  const stableProfile = profile ?? lastProfileRef.current;

  const activeArtistId = stableWorkspace?.type === 'artist'
    ? (stableWorkspace.artist as any)?.id || (stableWorkspace.artist as any)?.artist_id || null
    : null;
  const activeVenueLat = stableWorkspace?.type === 'venue'
    ? Number((stableWorkspace.venue as any)?.latitude ?? (stableWorkspace.venue as any)?.lat ?? null)
    : null;
  const activeVenueLng = stableWorkspace?.type === 'venue'
    ? Number((stableWorkspace.venue as any)?.longitude ?? (stableWorkspace.venue as any)?.lng ?? null)
    : null;
  const activeVenueCenter =
    stableWorkspace?.type === 'venue' &&
    Number.isFinite(activeVenueLat) &&
    Number.isFinite(activeVenueLng)
      ? [activeVenueLat, activeVenueLng] as [number, number]
      : null;

  if (authLoading && !user) {
    return (
      <IonPage>
        <IonContent fullscreen>
          <div className="flex items-center justify-center py-12">
            <IonSpinner name="crescent" />
          </div>
        </IonContent>
      </IonPage>
    );
  }

  if (!user) {
    return <Redirect to="/welcome" />;
  }

  if ((!workspaceReady || workspaceLoading) && !canCreateStable) {
    return (
      <IonPage>
        <IonContent fullscreen>
          <div className="flex items-center justify-center py-12">
            <IonSpinner name="crescent" />
          </div>
        </IonContent>
      </IonPage>
    );
  }

  if (workspaceReady && !canCreateStable) {
    return <Redirect to="/tabs/events" />;
  }

  return (
    <IonPage>
      <IonContent fullscreen >
        <CreateEventModal
          onDismiss={() => history.push(fallbackRoute)}
          onCreated={eventId => {
            if (eventId) {
              history.push(`/event/${eventId}`);
            } else {
              history.push(fallbackRoute);
            }
          }}
          userId={user?.id}
          profileRole={stableWorkspace?.type || stableProfile?.role || null}
          profileCity={stableWorkspace?.venue?.city || stableProfile?.primary_city || null}
          profileName={stableWorkspace?.artist?.name || stableWorkspace?.venue?.name || stableProfile?.display_name || stableProfile?.username || null}
          defaultArtistId={activeArtistId}
          initialMapCenter={activeVenueCenter}
        />
      </IonContent>
    </IonPage>
  );
};

export default CreateEventPage;
