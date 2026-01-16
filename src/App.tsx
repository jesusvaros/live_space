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
import QrScannerPage from './pages/QrScanner';
import ResetPassword from './pages/ResetPassword';
import EventDetail from './pages/EventDetail';
import ProfileDetail from './pages/ProfileDetail';
import PostDetail from './pages/PostDetail';
import VenueDetail from './pages/VenueDetail';

const App: React.FC = () => {
  const { user, loading, profile } = useAuth();
  const isOrganizerRole = Boolean(profile && ['artist', 'venue'].includes(profile.role));

  if (loading) {
    return (
      <IonApp>
        <IonPage>
          <IonContent fullscreen>
            <div className="app-screen flex items-center justify-center">
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
                  <IonTabBar slot="bottom" className="app-tab-bar">
                    <IonTabButton tab="events" href="/tabs/events">
                      <IconCalendar className="tab-icon" />
                      <span className="tab-label">Events</span>
                    </IonTabButton>
                    <IonTabButton tab="map" href="/tabs/map">
                      <IconMap className="tab-icon" />
                      <span className="tab-label">Map</span>
                    </IonTabButton>
                    <IonTabButton tab="qr-scanner" href="/tabs/qr-scanner">
                      {isOrganizerRole ? (
                        <>
                          <IconCalendar className="tab-icon" />
                          <span className="tab-label">My Space</span>
                        </>
                      ) : (
                        <>
                          <IconQrCode className="tab-icon" />
                          <span className="tab-label">Scan</span>
                        </>
                      )}
                    </IonTabButton>
                    <IonTabButton tab="profile" href="/tabs/profile">
                      <IconUser className="tab-icon" />
                      <span className="tab-label">Profile</span>
                    </IonTabButton>
                    <IonTabButton tab="feed" href="/tabs/feed">
                      <IconPlay className="tab-icon" />
                      <span className="tab-label">Moments</span>
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
