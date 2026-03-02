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
import { IconCalendar, IconMap, IconUser, IconCompass, IconPlus } from './components/icons';
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
import Admin from './pages/Admin';

const App: React.FC = () => {
  const { user, loading } = useAuth();
  const { activeWorkspace } = useWorkspace();
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
  const isArtistWorkspace = activeWorkspace?.type === 'artist';
  const mainTabHref = isArtistWorkspace ? '/tabs/mySpace' : '/tabs/events';
  const showOverlay = loading && !user;

  return (
    <IonApp>
      <IonReactRouter>
        <AppBackHandler />
        <IonRouterOutlet>
          <Route
            exact
            path="/welcome"
            render={() => (!loading && !user ? <Welcome /> : <Redirect to={mainTabHref} />)}
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
          <Route exact path="/admin" component={Admin} />
          <Route exact path="/admin/grants" render={() => <Redirect to="/admin" />} />
          <Route exact path="/admin/create-artist" render={() => <Redirect to="/admin" />} />
          <Route exact path="/admin/create-venue" render={() => <Redirect to="/admin" />} />
          <Route exact path="/admin/access-grants" render={() => <Redirect to="/admin" />} />
          <Route exact path="/reset" component={ResetPassword} />
          <Route
            exact
            path="/create-event"
            render={({ location }) => (
              <Redirect
                to={{
                  pathname: '/tabs/create-event',
                  state: location.state,
                }}
              />
            )}
          />
          <Route
            path="/tabs"
            render={() =>
              !loading && !user ? (
                <Redirect to="/welcome" />
              ) : (
                <IonTabs>
                  <IonRouterOutlet>
                    <Route exact path="/tabs/feed" component={Feed} />
                    <Route exact path="/tabs/mySpace" component={Feed} />
                    <Route exact path="/tabs/create-event" component={CreateEventPage} />
                    <Route exact path="/tabs/map" component={Map} />
                    <Route exact path="/tabs/discover" component={Discover} />
                    <Route exact path="/tabs/events" component={Events} />
                    <Route
                      exact
                      path="/tabs/profile"
                      render={({ location: routeLocation }) => {
                        const routeParams = new URLSearchParams(routeLocation.search);
                        const keepProfileOpen = routeParams.has('edit');
                        if (keepProfileOpen) {
                          return <Profile />;
                        }
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
                    <Route exact path="/tabs" render={() => <Redirect to={mainTabHref} />} />
                  </IonRouterOutlet>
                  <IonTabBar
                    slot="bottom"
                    className="h-16 px-2 py-2 [--background:rgba(11,11,13,0.92)] [--border:none] [--color:rgba(255,255,255,0.62)] [--color-selected:#ffffff] [--padding-top:6px] [--padding-bottom:6px] [--padding-start:10px] [--padding-end:10px] [--border-radius:0px] [--background-focused:rgba(255,107,74,0.16)]"
                  >
                    <IonTabButton tab="main" href={mainTabHref} aria-label="Main">
                      <IconCalendar className="h-5 w-5" />
                    </IonTabButton>
                    {isArtistWorkspace ? (
                      <IonTabButton tab="create-event" href="/tabs/create-event" aria-label="Create event">
                        <IconPlus className="h-5 w-5" />
                      </IonTabButton>
                    ) : (
                      <IonTabButton tab="discover" href="/tabs/discover" aria-label="Discover">
                        <IconCompass className="h-5 w-5" />
                      </IonTabButton>
                    )}
                    <IonTabButton tab="map" href="/tabs/map" aria-label="Map">
                      <IconMap className="h-5 w-5" />
                    </IonTabButton>
                    <IonTabButton tab="profile" href={profileTabHref} aria-label="Profile">
                      <IconUser className="h-5 w-5" />
                    </IonTabButton>
                  </IonTabBar>
                </IonTabs>
              )
            }
          />
          <Route
            exact
            path="/"
            render={() => <Redirect to={loading || user ? mainTabHref : "/welcome"} />}
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
