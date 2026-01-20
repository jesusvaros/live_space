import React from 'react';
import {
  IonApp,
  IonRouterOutlet,
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonPage,
  IonContent,
  IonSpinner,
} from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Redirect, Route } from 'react-router-dom';
import { IconCalendar, IconMap, IconQrCode, IconUser, IconPlay } from './components/icons';
import { useAuth } from './contexts/AuthContext';
import Welcome from './pages/Welcome';
import Feed from './pages/Feed';
import Events from './pages/Events';
import Profile from './pages/Profile';
import Map from './pages/Map';
import OrganizerEventsTab from './pages/OrganizerEventsTab';
import CreateEventPage from './pages/CreateEvent';
import QrScannerPage from './pages/QrScanner';
import ResetPassword from './pages/ResetPassword';
import EventDetail from './pages/EventDetail';
import ProfileDetail from './pages/ProfileDetail';
import PostDetail from './pages/PostDetail';
import VenueDetail from './pages/VenueDetail';

const App: React.FC = () => {
  const { user, loading, profile } = useAuth();
  const isOrganizerRole = Boolean(profile && ['artist', 'venue'].includes(profile.role));
  const tabBarStyle: { [key: string]: string } = {
    '--background': 'rgba(12, 15, 22, 0.95)',
    '--border': '1px solid rgba(255, 255, 255, 0.08)',
    '--color': '#7c8798',
    '--color-selected': 'var(--app-ink)',
    '--padding-top': '6px',
    '--padding-bottom': '6px',
    '--padding-start': '10px',
    '--padding-end': '10px',
    '--border-radius': '16px',
    '--background-focused': 'rgba(255, 107, 74, 0.2)',
  };

  if (loading) {
    return (
      <IonApp>
        <IonPage>
          <IonContent fullscreen>
            <div className="flex min-h-full flex-col items-center justify-center gap-4 p-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
              <IonSpinner name="crescent" />
            </div>
          </IonContent>
        </IonPage>
      </IonApp>
    );
  }

  return (
    <IonApp>
      <IonReactRouter>
        <IonRouterOutlet>
          <Route
            exact
            path="/welcome"
            render={() => (user ? <Redirect to="/tabs/events" /> : <Welcome />)}
          />
          <Route exact path="/event/:id" component={EventDetail} />
          <Route exact path="/venue/:id" component={VenueDetail} />
          <Route exact path="/profile/:id" component={ProfileDetail} />
          <Route exact path="/post/:id" component={PostDetail} />
          <Route exact path="/reset" component={ResetPassword} />
          <Route exact path="/create-event" component={CreateEventPage} />
          <Route
            path="/tabs"
            render={() => (
              user ? (
                <IonTabs>
                  <IonRouterOutlet>
                    <Route exact path="/tabs/feed" component={Feed} />
                    <Route exact path="/tabs/map" component={Map} />
                    <Route
                      exact
                      path="/tabs/qr-scanner"
                      render={() =>
                        isOrganizerRole ? <OrganizerEventsTab /> : <QrScannerPage />
                      }
                    />
                    <Route exact path="/tabs/events" component={Events} />
                    <Route exact path="/tabs/profile" component={Profile} />
                    <Route exact path="/tabs" render={() => <Redirect to="/tabs/events" />} />
                  </IonRouterOutlet>
                  <IonTabBar
                    slot="bottom"
                    className="mx-4 mb-[calc(10px+var(--ion-safe-area-bottom,0px))] mt-2 h-16 rounded-3xl px-2 py-2 shadow-[0_16px_30px_rgba(0,0,0,0.4)]"
                    style={tabBarStyle}
                  >
                    <IonTabButton tab="events" href="/tabs/events">
                      <IconCalendar className="h-5 w-5" />
                      <span className="text-[11px] uppercase tracking-[0.12em]">Events</span>
                    </IonTabButton>
                    <IonTabButton tab="map" href="/tabs/map">
                      <IconMap className="h-5 w-5" />
                      <span className="text-[11px] uppercase tracking-[0.12em]">Map</span>
                    </IonTabButton>
                    <IonTabButton tab="qr-scanner" href="/tabs/qr-scanner">
                      {isOrganizerRole ? (
                        <>
                          <IconCalendar className="h-5 w-5" />
                          <span className="text-[11px] uppercase tracking-[0.12em]">My Space</span>
                        </>
                      ) : (
                        <>
                          <IconQrCode className="h-5 w-5" />
                          <span className="text-[11px] uppercase tracking-[0.12em]">Scan</span>
                        </>
                      )}
                    </IonTabButton>
                    <IonTabButton tab="profile" href="/tabs/profile">
                      <IconUser className="h-5 w-5" />
                      <span className="text-[11px] uppercase tracking-[0.12em]">Profile</span>
                    </IonTabButton>
                    <IonTabButton tab="feed" href="/tabs/feed">
                      <IconPlay className="h-5 w-5" />
                      <span className="text-[11px] uppercase tracking-[0.12em]">Moments</span>
                    </IonTabButton>
                  </IonTabBar>
                </IonTabs>
              ) : (
                <Redirect to="/welcome" />
              )
            )}
          />
          <Route exact path="/" render={() => <Redirect to={user ? "/tabs/events" : "/welcome"} />} />
        </IonRouterOutlet>
      </IonReactRouter>
    </IonApp>
  );
};

export default App;
