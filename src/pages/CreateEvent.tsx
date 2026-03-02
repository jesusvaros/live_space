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
  const fallbackRoute = location.state?.from || '/tabs/mySpace';

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
          <div className="flex min-h-full items-center justify-center py-12">
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
          <div className="flex min-h-full items-center justify-center py-12">
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
      <IonContent fullscreen scrollY={false}>
        <div className="relative h-full overflow-hidden bg-app-bg">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_10%_8%,rgba(255,107,74,0.24),transparent_56%)]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_88%_10%,rgba(122,167,255,0.16),transparent_62%)]" />
          <div className="relative z-10 mx-auto h-full w-full max-w-3xl px-0 sm:px-4 sm:py-4">
            <div className="h-full sm:overflow-hidden sm:rounded-3xl sm:border sm:border-white/10 sm:bg-black/20 sm:backdrop-blur-xl">
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
            </div>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default CreateEventPage;
