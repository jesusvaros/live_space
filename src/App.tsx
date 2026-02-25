import React from 'react';
import {
  IonApp,
  IonRouterOutlet,
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonSpinner,
} from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Redirect, Route } from 'react-router-dom';
import { IconCalendar, IconMap, IconUser, IconCompass } from './components/icons';
import { useAuth } from './contexts/AuthContext';
import { useWorkspace } from './contexts/WorkspaceContext';
import AppBackHandler from './app/AppBackHandler';
import Welcome from './pages/Welcome';
import Feed from './pages/Feed';
import Events from './pages/Events';
import Profile from './pages/Profile';
import Map from './pages/Map';
import Discover from './pages/Discover';
import CreateEventPage from './pages/CreateEvent';
import ResetPassword from './pages/ResetPassword';
import EventDetail from './pages/EventDetail';
import ProfileDetail from './pages/ProfileDetail';
import ArtistProfile from './pages/ArtistProfile';
import PostDetail from './pages/PostDetail';
import VenueDetail from './pages/VenueDetail';
import AdminGrants from './pages/AdminGrants';
import AdminCreateArtist from './pages/AdminCreateArtist';
import AdminCreateVenue from './pages/AdminCreateVenue';
import AdminAccessList from './pages/AdminAccessList';

const App: React.FC = () => {
  const { user, loading } = useAuth();
  const { activeWorkspace, loading: workspaceLoading } = useWorkspace();
  const activeArtistId = activeWorkspace?.type === 'artist'
    ? (activeWorkspace.artist as any)?.id || (activeWorkspace.artist as any)?.artist_id || null
    : null;
  const activeVenueId = activeWorkspace?.type === 'venue'
    ? (activeWorkspace.venue as any)?.id || (activeWorkspace.venue as any)?.venue_place_id || null
    : null;
  const profileTabHref =
    activeWorkspace?.type === 'artist' && activeArtistId
      ? `/tabs/artist/${activeArtistId}`
      : activeWorkspace?.type === 'venue' && activeVenueId
        ? `/tabs/venue/${activeVenueId}`
        : '/tabs/profile';
  const tabBarStyle: { [key: string]: string } = {
    '--background': 'rgba(11, 11, 13, 0.92)',
    '--border': 'none',
    '--color': 'rgba(255, 255, 255, 0.62)',
    '--color-selected': '#ffffff',
    '--padding-top': '6px',
    '--padding-bottom': '6px',
    '--padding-start': '10px',
    '--padding-end': '10px',
    '--border-radius': '0px',
    '--background-focused': 'rgba(255, 107, 74, 0.16)',
  };

  const showOverlay = loading && !user;

  return (
    <IonApp>
      <IonReactRouter>
        <AppBackHandler />
        <IonRouterOutlet>
          <Route
            exact
            path="/welcome"
            render={() => (!loading && !user ? <Welcome /> : <Redirect to="/tabs/events" />)}
          />
          <Route exact path="/event/:id" component={EventDetail} />
          <Route exact path="/profile/:id" component={ProfileDetail} />
          <Route exact path="/post/:id" component={PostDetail} />
          <Route exact path="/discover" render={() => <Redirect to="/tabs/discover" />} />
          <Route
            exact
            path="/artist/:id"
            render={({ match }) => <Redirect to={`/tabs/artist/${match.params.id}`} />}
          />
          <Route
            exact
            path="/venue/:id"
            render={({ match }) => <Redirect to={`/tabs/venue/${match.params.id}`} />}
          />
          <Route exact path="/admin/grants" component={AdminGrants} />
          <Route exact path="/admin/create-artist" component={AdminCreateArtist} />
          <Route exact path="/admin/create-venue" component={AdminCreateVenue} />
          <Route exact path="/admin/access-grants" component={AdminAccessList} />
          <Route exact path="/reset" component={ResetPassword} />
          <Route exact path="/create-event" component={CreateEventPage} />
          <Route
            path="/tabs"
            render={() =>
              !loading && !user ? (
                <Redirect to="/welcome" />
              ) : (
                <IonTabs>
                  <IonRouterOutlet>
                    <Route exact path="/tabs/feed" component={Feed} />
                    <Route exact path="/tabs/map" component={Map} />
                    <Route exact path="/tabs/discover" component={Discover} />
                    <Route exact path="/tabs/events" component={Events} />
                    <Route
                      exact
                      path="/tabs/profile"
                      render={() => {
                        console.log('[profile-route] workspace loading:', workspaceLoading, 'workspace:', activeWorkspace);
                        if (activeWorkspace?.type === 'artist' && activeArtistId) {
                          return <Redirect to={`/tabs/artist/${activeArtistId}`} />;
                        }
                        if (activeWorkspace?.type === 'venue' && activeVenueId) {
                          return <Redirect to={`/tabs/venue/${activeVenueId}`} />;
                        }
                        return <Profile />;
                      }}
                    />
                    <Route exact path="/tabs/artist/:id" component={ArtistProfile} />
                    <Route exact path="/tabs/venue/:id" component={VenueDetail} />
                    <Route exact path="/tabs" render={() => <Redirect to="/tabs/events" />} />
                  </IonRouterOutlet>
                  <IonTabBar
                    slot="bottom"
                    className="h-16 px-2 py-2"
                    style={tabBarStyle}
                  >
                    <IonTabButton tab="events" href="/tabs/events">
                      <IconCalendar className="h-5 w-5" />
                      <span className="text-[11px] uppercase tracking-[0.12em]">Main</span>
                    </IonTabButton>
                    <IonTabButton tab="discover" href="/tabs/discover">
                      <IconCompass className="h-5 w-5" />
                      <span className="text-[11px] uppercase tracking-[0.12em]">Discover</span>
                    </IonTabButton>
                    <IonTabButton tab="map" href="/tabs/map">
                      <IconMap className="h-5 w-5" />
                      <span className="text-[11px] uppercase tracking-[0.12em]">Map</span>
                    </IonTabButton>
                    <IonTabButton tab="profile" href={profileTabHref}>
                      <IconUser className="h-5 w-5" />
                      <span className="text-[11px] uppercase tracking-[0.12em]">Profile</span>
                    </IonTabButton>
                  </IonTabBar>
                </IonTabs>
              )
            }
          />
          <Route
            exact
            path="/"
            render={() => <Redirect to={loading || user ? "/tabs/events" : "/welcome"} />}
          />
        </IonRouterOutlet>
      </IonReactRouter>

      {showOverlay && (
        <div className="pointer-events-none fixed inset-0 z-[5000] flex items-center justify-center bg-black/35 backdrop-blur">
          <IonSpinner name="crescent" />
        </div>
      )}
    </IonApp>
  );
};

export default App;
