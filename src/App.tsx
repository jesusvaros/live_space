import React from 'react';
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { IconCalendar, IconUser, IconCompass, IconPlus, IconPlay } from './components/icons';
import { Spinner } from './components/ui/AppPrimitives';
import { useAuth } from './contexts/AuthContext';
import { useWorkspace } from './contexts/WorkspaceContext';
import AppBackHandler from './app/AppBackHandler';
import Welcome from './pages/Welcome';
import Feed from './pages/Feed';
import Events from './pages/Events';
import Profile from './pages/Profile';
import Discover from './pages/Discover';
import ResetPassword from './pages/ResetPassword';
import ProfileDetail from './pages/ProfileDetail';
import ArtistProfile from './pages/ArtistProfile';
import PostDetail from './pages/PostDetail';
import VenueDetail from './pages/VenueDetail';

const Admin = React.lazy(() => import('./pages/Admin'));
const CreateEventPage = React.lazy(() => import('./pages/CreateEvent'));
const EventDetail = React.lazy(() => import('./pages/EventDetail'));
const Map = React.lazy(() => import('./pages/Map'));
const Upload = React.lazy(() => import('./pages/Upload'));

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
  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[10px] transition-colors ${
      isActive ? 'bg-app-accent/20 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
    }`;

  const createHref = isArtistWorkspace ? '/tabs/create-event' : '/tabs/upload';

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-app-bg text-white">
      <div className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </div>
      <nav
        className="z-[2000] grid shrink-0 grid-cols-5 gap-1 border-t border-white/10 bg-[#0b0b0d]/95 px-2 pb-[calc(8px+env(safe-area-inset-bottom,0px))] pt-2 backdrop-blur"
        aria-label="Primary navigation"
      >
        <NavLink to={mainTabHref} className={navItemClass} aria-label="Home">
          <IconCalendar className="h-5 w-5" />
          <span>Inicio</span>
        </NavLink>
        <NavLink to="/tabs/discover" className={navItemClass} aria-label="Explore">
          <IconCompass className="h-5 w-5" />
          <span>Explorar</span>
        </NavLink>
        <NavLink to={createHref} className={navItemClass} aria-label="Create">
          <IconPlus className="h-5 w-5" />
          <span>Crear</span>
        </NavLink>
        <NavLink to="/tabs/feed" className={navItemClass} aria-label="Moments">
          <IconPlay className="h-5 w-5" />
          <span>Momentos</span>
        </NavLink>
        <NavLink to={profileTabHref} className={navItemClass} aria-label="Profile">
          <IconUser className="h-5 w-5" />
          <span>Perfil</span>
        </NavLink>
      </nav>
    </div>
  );
};

const AppRoutes = () => {
  const { user, loading } = useAuth();
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
      <Routes>
        <Route path="/welcome" element={<WelcomeRoute />} />
        <Route path="/event/:id" element={deferredPage(<EventDetail />)} />
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
        <Route path="/" element={<Navigate to={loading ? '/welcome' : mainTabHref} replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {loading && !user ? (
        <div className="pointer-events-none fixed inset-0 z-[5000] flex items-center justify-center bg-black/35 backdrop-blur">
          <Spinner />
        </div>
      ) : null}
    </>
  );
};

const App: React.FC = () => (
  <BrowserRouter>
    <AppRoutes />
  </BrowserRouter>
);

export default App;
