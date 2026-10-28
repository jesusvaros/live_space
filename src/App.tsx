import React, { useEffect } from 'react';
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
import { clearReturnTo, readReturnTo, rememberReturnTo } from './auth/returnTo';
import MomentNudges from './features/moments/MomentNudges';
import ConcertAlertsListener from './features/alerts/ConcertAlertsListener';
import ShareTargetListener from './features/socialImport/ShareTargetListener';
import Welcome from './pages/Welcome';
import Events from './pages/Events';

const Feed = React.lazy(() => import('./pages/Feed'));
const MerchOrder = React.lazy(() => import('./pages/MerchOrder'));
const MerchOrders = React.lazy(() => import('./pages/MerchOrders'));
const MerchManage = React.lazy(() => import('./pages/MerchManage'));
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
const SuggestedUpload = React.lazy(() => import('./pages/SuggestedUpload'));
const Import = React.lazy(() => import('./pages/Import'));
const Wrapped = React.lazy(() => import('./pages/Wrapped'));
const GestionEstadisticas = React.lazy(() => import('./pages/GestionEstadisticas'));
const LicenciaMomentos = React.lazy(() => import('./pages/LicenciaMomentos'));
const ClaimProfile = React.lazy(() => import('./pages/ClaimProfile'));
const Management = React.lazy(() => import('./pages/Management'));
const FestivalDetail = React.lazy(() => import('./pages/FestivalDetail'));
const FestivalTimetable = React.lazy(() => import('./pages/FestivalTimetable'));
const EventQr = React.lazy(() => import('./pages/EventQr'));
const AgendaSetup = React.lazy(() => import('./pages/AgendaSetup'));

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

const UploadRedirect = () => {
  const location = useLocation();
  return <Navigate to={`/tabs/upload${location.search}`} replace />;
};

const CreateEventRedirect = () => {
  const location = useLocation();
  return <Navigate to="/tabs/create-event" replace state={location.state} />;
};

const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  useEffect(() => {
    if (user) clearReturnTo();
  }, [user]);
  if (loading) {
    return (
      <div className="flex h-full min-h-48 items-center justify-center bg-app-bg text-white">
        <Spinner />
      </div>
    );
  }
  if (!user) {
    // Back here after signing in (e.g. a concert QR scanned without an account).
    rememberReturnTo(`${location.pathname}${location.search}`);
    return <Navigate to="/welcome" replace />;
  }
  return <>{children}</>;
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
  return user ? <Navigate to={readReturnTo()} replace /> : <Welcome />;
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
      <MomentNudges />
      <ConcertAlertsListener />
      <ShareTargetListener />
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
          <Route path="/gestion/merch" element={<RequireAuth>{deferredPage(<MerchManage />)}</RequireAuth>} />
          <Route path="/pedidos" element={<RequireAuth>{deferredPage(<MerchOrders />)}</RequireAuth>} />
          <Route path="/pedidos/:id" element={<RequireAuth>{deferredPage(<MerchOrder />)}</RequireAuth>} />
          <Route path="/gestion/estadisticas" element={<RequireAuth>{deferredPage(<GestionEstadisticas />)}</RequireAuth>} />
          <Route path="/legal/licencia-momentos" element={deferredPage(<LicenciaMomentos />)} />
          <Route path="/create-event" element={<RequireAuth><CreateEventRedirect /></RequireAuth>} />
          <Route path="/upload" element={<RequireAuth><UploadRedirect /></RequireAuth>} />
          {/* Morning-after nudge: clips found in the gallery, ready to publish */}
          <Route path="/subir/sugerido" element={<RequireAuth>{deferredPage(<SuggestedUpload />)}</RequireAuth>} />
          <Route path="/reclamar/:type/:id" element={<RequireAuth>{deferredPage(<ClaimProfile />)}</RequireAuth>} />
          <Route path="/gestion" element={<RequireAuth>{deferredPage(<Management />)}</RequireAuth>} />
          <Route path="/gestion/festival/:id" element={<RequireAuth>{deferredPage(<FestivalTimetable />)}</RequireAuth>} />
          <Route path="/gestion/evento/:id/qr" element={<RequireAuth>{deferredPage(<EventQr />)}</RequireAuth>} />
          <Route path="/empezar" element={<RequireAuth>{deferredPage(<AgendaSetup />)}</RequireAuth>} />
          <Route path="/importar" element={deferredPage(<Import />)} />
          <Route path="/wrapped" element={deferredPage(<Wrapped />)} />
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
            <Route path="festival/:id" element={deferredPage(<FestivalDetail />)} />
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
