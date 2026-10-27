import React from 'react';
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import BottomNav, { isDetailRoute } from './components/BottomNav';
import { Spinner } from './components/ui/AppPrimitives';
import { useAuth } from './contexts/AuthContext';
import { useWorkspace } from './contexts/WorkspaceContext';
import AppBackHandler from './app/AppBackHandler';
import AuthDeepLinks from './app/AuthDeepLinks';
import Welcome from './pages/Welcome';
import Events from './pages/Events';

const Feed = React.lazy(() => import('./pages/Feed'));
const Profile = React.lazy(() => import('./pages/Profile'));
const Discover = React.lazy(() => import('./pages/Discover'));
const ResetPassword = React.lazy(() => import('./pages/ResetPassword'));
const ProfileDetail = React.lazy(() => import('./pages/ProfileDetail'));
const ArtistProfile = React.lazy(() => import('./pages/ArtistProfile'));
const PostDetail = React.lazy(() => import('./pages/PostDetail'));
const VenueDetail = React.lazy(() => import('./pages/VenueDetail'));
const Admin = React.lazy(() => import('./pages/Admin'));
const CreateEventPage = React.lazy(() => import('./pages/CreateEvent'));
const EventDetail = React.lazy(() => import('./pages/EventDetail'));
const Map = React.lazy(() => import('./pages/Map'));
const Upload = React.lazy(() => import('./pages/Upload'));
const GestionEstadisticas = React.lazy(() => import('./pages/GestionEstadisticas'));
const LicenciaMomentos = React.lazy(() => import('./pages/LicenciaMomentos'));

const deferredPage = (page: React.ReactNode) => (
  <React.Suspense
    fallback={(
      <div className="flex h-full min-h-48 items-center justify-center bg-app-bg text-white">
        <Spinner />
      </div>
    )}
  >
    {page}
  </React.Suspense>
);

const LegacyEntityRedirect: React.FC<{ type: 'artist' | 'venue' }> = ({ type }) => {
  const location = useLocation();
  const id = location.pathname.split('/').filter(Boolean).at(-1);
  return <Navigate to={id ? `/tabs/${type}/${id}` : '/tabs/events'} replace />;
};

const CreateEventRedirect = () => {
  const location = useLocation();
  return <Navigate to="/tabs/create-event" replace state={location.state} />;
};

const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-full min-h-48 items-center justify-center bg-app-bg text-white">
        <Spinner />
      </div>
    );
  }
  return user ? <>{children}</> : <Navigate to="/welcome" replace />;
};

const WelcomeRoute = () => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-app-bg text-white">
        <Spinner />
      </div>
    );
  }
  return user ? <Navigate to="/tabs/events" replace /> : <Welcome />;
};

const ProfileRoute: React.FC<{
  activeArtistId: string | null;
  activeVenueId: string | null;
  workspaceType?: string;
}> = ({ activeArtistId, activeVenueId, workspaceType }) => {
  const location = useLocation();
  if (new URLSearchParams(location.search).has('edit')) return <Profile />;
  if (workspaceType === 'artist' && activeArtistId) {
    return <Navigate to={`/tabs/artist/${activeArtistId}`} replace />;
  }
  if (workspaceType === 'venue' && activeVenueId) {
    return <Navigate to={`/tabs/venue/${activeVenueId}`} replace />;
  }
  return <Profile />;
};

type TabsLayoutProps = {
  mainTabHref: string;
  profileTabHref: string;
  isArtistWorkspace: boolean;
};

const TabsLayout: React.FC<TabsLayoutProps> = ({
  mainTabHref,
  profileTabHref,
  isArtistWorkspace,
}) => {
  const { pathname } = useLocation();
  void isArtistWorkspace;
  // Detail screens have their own back header and bottom action bar.
  const showNav = !isDetailRoute(pathname) || pathname === profileTabHref;

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-app-bg text-white">
      <div className="min-h-0 flex-1 overflow-hidden">
        {deferredPage(<Outlet />)}
      </div>
      {showNav ? <BottomNav mainTabHref={mainTabHref} profileTabHref={profileTabHref} /> : null}
    </div>
  );
};

const AppRoutes = () => {
  const { activeWorkspace } = useWorkspace();
  const activeArtistId = activeWorkspace?.type === 'artist'
    ? (activeWorkspace.artist as any)?.id || (activeWorkspace.artist as any)?.artist_id || null
    : null;
  const activeVenueId = activeWorkspace?.type === 'venue'
    ? (activeWorkspace.venue as any)?.id || (activeWorkspace.venue as any)?.venue_place_id || null
    : null;
  const profileTabHref = activeWorkspace?.type === 'artist' && activeArtistId
    ? `/tabs/artist/${activeArtistId}`
    : activeWorkspace?.type === 'venue' && activeVenueId
      ? `/tabs/venue/${activeVenueId}`
      : '/tabs/profile';
  const isArtistWorkspace = activeWorkspace?.type === 'artist';
  const mainTabHref = '/tabs/events';

  return (
    <>
      <AppBackHandler mainTabPath={mainTabHref} />
      <AuthDeepLinks />
      <React.Suspense fallback={<div className="h-dvh bg-app-bg" />}>
        <Routes>
          <Route path="/welcome" element={<WelcomeRoute />} />
          <Route path="/event/:id" element={deferredPage(<EventDetail />)} />
          <Route path="/concierto/:slug" element={deferredPage(<EventDetail />)} />
          <Route path="/profile/:id" element={<ProfileDetail />} />
          <Route path="/post/:id" element={<PostDetail />} />
          <Route path="/discover" element={<Navigate to="/tabs/discover" replace />} />
          <Route path="/artist/:id" element={<LegacyEntityRedirect type="artist" />} />
          <Route path="/venue/:id" element={<LegacyEntityRedirect type="venue" />} />
          <Route path="/admin" element={<RequireAuth>{deferredPage(<Admin />)}</RequireAuth>} />
          <Route path="/admin/grants" element={<Navigate to="/admin" replace />} />
          <Route path="/admin/create-artist" element={<Navigate to="/admin" replace />} />
          <Route path="/admin/create-venue" element={<Navigate to="/admin" replace />} />
          <Route path="/admin/access-grants" element={<Navigate to="/admin" replace />} />
          <Route path="/reset" element={<ResetPassword />} />
          <Route path="/gestion/estadisticas" element={<RequireAuth>{deferredPage(<GestionEstadisticas />)}</RequireAuth>} />
          <Route path="/legal/licencia-momentos" element={deferredPage(<LicenciaMomentos />)} />
          <Route path="/create-event" element={<RequireAuth><CreateEventRedirect /></RequireAuth>} />
          <Route path="/upload" element={<RequireAuth><Navigate to="/tabs/upload" replace /></RequireAuth>} />
          <Route
            path="/tabs"
            element={(
              <TabsLayout
                mainTabHref={mainTabHref}
                profileTabHref={profileTabHref}
                isArtistWorkspace={isArtistWorkspace}
              />
            )}
          >
            <Route path="feed" element={<Feed />} />
            <Route path="mySpace" element={<Feed />} />
            <Route path="create-event" element={<RequireAuth>{deferredPage(<CreateEventPage />)}</RequireAuth>} />
            <Route path="upload" element={<RequireAuth>{deferredPage(<Upload />)}</RequireAuth>} />
            <Route path="map" element={deferredPage(<Map />)} />
            <Route path="discover" element={<Discover />} />
            <Route path="events" element={<Events />} />
            <Route
              path="profile"
              element={<RequireAuth><ProfileRoute
                activeArtistId={activeArtistId}
                activeVenueId={activeVenueId}
                workspaceType={activeWorkspace?.type}
              /></RequireAuth>}
            />
            <Route path="artist/:id" element={<ArtistProfile />} />
            <Route path="venue/:id" element={<VenueDetail />} />
            <Route index element={<Navigate to={mainTabHref} replace />} />
          </Route>
          <Route
            element={(
              <TabsLayout
                mainTabHref={mainTabHref}
                profileTabHref={profileTabHref}
                isArtistWorkspace={isArtistWorkspace}
              />
            )}
          >
            <Route path="sala/:slug" element={<VenueDetail />} />
            <Route path="artista/:slug" element={<ArtistProfile />} />
            <Route path="madrid/conciertos/*" element={<Events />} />
            <Route path="barcelona/conciertos/*" element={<Events />} />
          </Route>
          <Route path="/" element={<Navigate to={mainTabHref} replace />} />
          <Route path="*" element={<Navigate to={mainTabHref} replace />} />
        </Routes>
      </React.Suspense>

    </>
  );
};

const App: React.FC = () => (
  <BrowserRouter>
    <AppRoutes />
  </BrowserRouter>
);

export default App;
