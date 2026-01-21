import React from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { Redirect, useHistory, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import CreateEventModal from '../components/event/CreateEventModal';

const CreateEventPage: React.FC = () => {
  const history = useHistory();
  const location = useLocation<{ from?: string }>();
  const { user, profile } = useAuth();
  const { canCreateEvent, activeWorkspace } = useWorkspace();
  const fallbackRoute = location.state?.from || '/tabs/events';

  if (!user) {
    return <Redirect to="/welcome" />;
  }

  if (!canCreateEvent) {
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
          profileRole={activeWorkspace?.type || profile?.role || null}
          profileCity={activeWorkspace?.venue?.city || profile?.primary_city || null}
          profileName={activeWorkspace?.artist?.name || activeWorkspace?.venue?.name || profile?.display_name || profile?.username || null}
        />
      </IonContent>
    </IonPage>
  );
};

export default CreateEventPage;
