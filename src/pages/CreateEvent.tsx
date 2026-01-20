import React from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { Redirect, useHistory, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CreateEventModal from '../components/event/CreateEventModal';

const CreateEventPage: React.FC = () => {
  const history = useHistory();
  const location = useLocation<{ from?: string }>();
  const { user, profile } = useAuth();
  const organizerAllowed = Boolean(profile && ['artist', 'venue', 'label'].includes(profile.role));
  const fallbackRoute = location.state?.from || '/tabs/events';

  if (!user) {
    return <Redirect to="/welcome" />;
  }

  if (!organizerAllowed) {
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
          profileRole={profile?.role ?? null}
          profileCity={profile?.primary_city ?? null}
          profileName={profile?.display_name || profile?.username || null}
        />
      </IonContent>
    </IonPage>
  );
};

export default CreateEventPage;
