import React, { useEffect, useRef } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import BottomNav, { isDetailRoute } from './components/BottomNav';
import { Spinner } from './components/ui/AppPrimitives';
import { useAuth } from './contexts/AuthContext';
import { useWorkspace } from './contexts/WorkspaceContext';
import AppBackHandler from './app/AppBackHandler';
import AuthDeepLinks from './app/AuthDeepLinks';
import { hasSeenOnboarding } from './app/onboarding';
import { clearReturnTo, readReturnTo, rememberReturnTo } from './auth/returnTo';
import MomentNudges from './features/moments/MomentNudges';
import ConcertAlertsListener from './features/alerts/ConcertAlertsListener';
import ShareTargetListener from './features/socialImport/ShareTargetListener';
import Welcome from './pages/Welcome';
import Events from './pages/Events';

// Screens load as separate chunks. The ones reachable from the tabs are
// fetched in the background once the first screen is up, so moving between
// screens never waits on a chunk (and never shows a loader for one).
const preloaders: Array<() => Promise<unknown>> = [];
const lazyPage = <T extends React.ComponentType<any>>(load: () => Promise<{ default: T }>, preload = true) => {
  if (preload) preloaders.push(load);
  return React.lazy(load);
};

const preloadPages = () => {
  for (const load of preloaders) void load().catch(() => undefined);
};

const Feed = lazyPage(() => import('./pages/Feed'));
// Dev-only playground for the concert player (mock moments); not in builds.
const TimelinePlayground = import.meta.env.DEV ? lazyPage(() => import('./pages/dev/TimelinePlayground'), false) : null;
const MerchPlayground = import.meta.env.DEV ? lazyPage(() => import('./pages/dev/MerchPlayground'), false) : null;
const MerchOrder = lazyPage(() => import('./pages/MerchOrder'), false);
const MerchOrders = lazyPage(() => import('./pages/MerchOrders'), false);
const MerchManage = lazyPage(() => import('./pages/MerchManage'), false);
const Profile = lazyPage(() => import('./pages/Profile'));
const Discover = lazyPage(() => import('./pages/Discover'));
const ResetPassword = lazyPage(() => import('./pages/ResetPassword'), false);
const ProfileDetail = lazyPage(() => import('./pages/ProfileDetail'));
const ArtistProfile = lazyPage(() => import('./pages/ArtistProfile'));
const PostDetail = lazyPage(() => import('./pages/PostDetail'));
const VenueDetail = lazyPage(() => import('./pages/VenueDetail'));
const Admin = lazyPage(() => import('./pages/Admin'), false);
const CreateEventPage = lazyPage(() => import('./pages/CreateEvent'), false);
const EventDetail = lazyPage(() => import('./pages/EventDetail'));
// Not preloaded: MapLibre (~300 kB gzip plus its worker) only loads on the Map tab.
const Map = lazyPage(() => import('./pages/Map'), false);
const Upload = lazyPage(() => import('./pages/Upload'));
const Onboarding = lazyPage(() => import('./pages/Onboarding'));
const SuggestedUpload = lazyPage(() => import('./pages/SuggestedUpload'));
const Import = lazyPage(() => import('./pages/Import'));
const Wrapped = lazyPage(() => import('./pages/Wrapped'), false);
const GestionEstadisticas = lazyPage(() => import('./pages/GestionEstadisticas'), false);
const LegalPage = lazyPage(() => import('./pages/LegalPage'), false);
const SettingsScreen = lazyPage(() => import('./features/settings/SettingsScreen'));
const ClaimProfile = lazyPage(() => import('./pages/ClaimProfile'), false);
const Management = lazyPage(() => import('./pages/Management'), false);
const FestivalDetail = lazyPage(() => import('./pages/FestivalDetail'));
const FestivalTimetable = lazyPage(() => import('./pages/FestivalTimetable'), false);
const EventQr = lazyPage(() => import('./pages/EventQr'), false);
const AgendaSetup = lazyPage(() => import('./pages/AgendaSetup'));

const deferredPage = (page: React.ReactNode) => (
  <React.Suspense fallback={<div className="h-full min-h-48 bg-app-bg" />}>
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

// First open without an account goes to the onboarding, once. Not when the
// app was opened by a link (a concert QR, a shared concert): that person
// came for something specific.
const FirstRunGate = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current || loading) return;
    checked.current = true;
    if (user || hasSeenOnboarding()) return;
    const onHome = () => ['/', '/tabs/events'].includes(window.location.pathname);
    const go = () => {
      if (onHome()) navigate('/bienvenida', { replace: true });
    };
    if (!Capacitor.isNativePlatform()) {
      go();
      return;
    }
    CapacitorApp.getLaunchUrl()
      .then(launch => {
        if (!launch?.url) go();
      })
      .catch(go);
  }, [loading, user, navigate]);
  return null;
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
  // Old «Editar perfil» links: the form now lives in Ajustes.
  if (new URLSearchParams(location.search).has('edit')) return <Navigate to="/ajustes/perfil" replace />;
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

  useEffect(() => {
    // After the first screen has painted, so it does not compete with it.
    const timer = window.setTimeout(preloadPages, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <AppBackHandler mainTabPath={mainTabHref} />
      <AuthDeepLinks />
      <FirstRunGate />
      <MomentNudges />
      <ConcertAlertsListener />
      <ShareTargetListener />
      <React.Suspense fallback={<div className="h-dvh bg-app-bg" />}>
        <Routes>
          <Route path="/welcome" element={<WelcomeRoute />} />
          <Route path="/bienvenida" element={deferredPage(<Onboarding />)} />
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
          {/* Privacy policy, terms, account deletion, moments licence: bundled, no account needed. */}
          <Route path="/legal/:doc" element={deferredPage(<LegalPage />)} />
          <Route path="/ajustes" element={<RequireAuth>{deferredPage(<SettingsScreen />)}</RequireAuth>} />
          <Route path="/ajustes/:section" element={<RequireAuth>{deferredPage(<SettingsScreen />)}</RequireAuth>} />
          <Route path="/create-event" element={<RequireAuth><CreateEventRedirect /></RequireAuth>} />
          <Route path="/upload" element={<UploadRedirect />} />
          {/* Morning-after nudge: clips found in the gallery, ready to publish */}
          <Route path="/subir/sugerido" element={<RequireAuth>{deferredPage(<SuggestedUpload />)}</RequireAuth>} />
          <Route path="/reclamar/:type/:id" element={<RequireAuth>{deferredPage(<ClaimProfile />)}</RequireAuth>} />
          <Route path="/gestion" element={<RequireAuth>{deferredPage(<Management />)}</RequireAuth>} />
          <Route path="/gestion/festival/:id" element={<RequireAuth>{deferredPage(<FestivalTimetable />)}</RequireAuth>} />
          <Route path="/gestion/evento/:id/qr" element={<RequireAuth>{deferredPage(<EventQr />)}</RequireAuth>} />
          <Route path="/empezar" element={<RequireAuth>{deferredPage(<AgendaSetup />)}</RequireAuth>} />
          <Route path="/importar" element={deferredPage(<Import />)} />
          <Route path="/wrapped" element={deferredPage(<Wrapped />)} />
          {TimelinePlayground ? <Route path="/dev/linea-de-tiempo" element={deferredPage(<TimelinePlayground />)} /> : null}
          {MerchPlayground ? <Route path="/dev/merch" element={deferredPage(<MerchPlayground />)} /> : null}
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
            <Route path="upload" element={deferredPage(<Upload />)} />
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
