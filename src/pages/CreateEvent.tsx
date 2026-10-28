import React, { useEffect, useMemo, useRef } from 'react';
import { Content, Page, Spinner } from '../components/ui/AppPrimitives';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import CreateEventModal from '../components/event/CreateEventModal';
import { ManagedEntity } from '../lib/types';
import { ConcertWorkspace } from '../hooks/useCreateEventForm';

const CreateEventPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { from?: string } | null;
  const { user, loading: authLoading } = useAuth();
  const { canCreateEvent, activeWorkspace, loading: workspaceLoading, ready: workspaceReady } = useWorkspace();
  const lastCanCreateRef = useRef<boolean | null>(null);
  const lastWorkspaceRef = useRef<ManagedEntity | null>(null);
  const fallbackRoute = locationState?.from || '/tabs/mySpace';

  useEffect(() => {
    if (workspaceReady) {
      lastCanCreateRef.current = canCreateEvent;
    }
  }, [workspaceReady, canCreateEvent]);

  useEffect(() => {
    if (!user) {
      lastCanCreateRef.current = null;
      lastWorkspaceRef.current = null;
    }
  }, [user]);

  useEffect(() => {
    if (activeWorkspace) {
      lastWorkspaceRef.current = activeWorkspace;
    }
  }, [activeWorkspace]);

  const canCreateStable = workspaceReady ? canCreateEvent : (lastCanCreateRef.current ?? false);
  const stableWorkspace = activeWorkspace ?? lastWorkspaceRef.current;

  const workspace = useMemo<ConcertWorkspace | null>(() => {
    if (stableWorkspace?.type === 'artist' && stableWorkspace.artist) {
      return {
        type: 'artist',
        subjectId: stableWorkspace.subject_id,
        artist: { id: stableWorkspace.artist.id, name: stableWorkspace.artist.name },
      };
    }
    if (stableWorkspace?.type === 'venue' && stableWorkspace.venue) {
      return {
        type: 'venue',
        subjectId: stableWorkspace.subject_id,
        venue: { id: stableWorkspace.venue.id, name: stableWorkspace.venue.name, city: stableWorkspace.venue.city || null },
      };
    }
    return null;
  }, [stableWorkspace]);

  if (authLoading && !user) {
    return (
      <Page>
        <Content fullscreen>
          <div className="flex min-h-full items-center justify-center py-12">
            <Spinner />
          </div>
        </Content>
      </Page>
    );
  }

  if (!user) {
    return <Navigate to="/welcome" replace />;
  }

  if ((!workspaceReady || workspaceLoading) && !canCreateStable) {
    return (
      <Page>
        <Content fullscreen>
          <div className="flex min-h-full items-center justify-center py-12">
            <Spinner />
          </div>
        </Content>
      </Page>
    );
  }

  if (workspaceReady && !canCreateStable) {
    return <Navigate to="/tabs/events" replace />;
  }

  return (
    <Page>
      <Content fullscreen scrollY={false}>
        <div className="relative h-full overflow-hidden bg-app-bg">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_10%_8%,rgba(255,91,46,0.24),transparent_56%)]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_88%_10%,rgba(122,167,255,0.16),transparent_62%)]" />
          <div className="relative z-10 mx-auto h-full w-full max-w-3xl px-0 sm:px-4 sm:py-4">
            <div className="h-full sm:overflow-hidden sm:rounded-3xl sm:border sm:border-white/10 sm:bg-black/20 sm:backdrop-blur-xl">
              <CreateEventModal
                onDismiss={() => navigate(fallbackRoute)}
                onCreated={result => navigate(`/event/${result.eventId}`)}
                userId={user?.id}
                workspace={workspace}
              />
            </div>
          </div>
        </div>
      </Content>
    </Page>
  );
};

export default CreateEventPage;
