import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AppBrand from './AppBrand';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import { useAuth } from '../contexts/AuthContext';

export type AppHeaderProps = {
  title?: string;
  rightSlot?: React.ReactNode;
  showBack?: boolean;
};

const AppHeader: React.FC<AppHeaderProps> = ({ title, rightSlot, showBack }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const inAdminRoute = location.pathname.startsWith('/admin');
  void showBack;

  const handleBrandClick = () => {
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-[1200] bg-app-bg px-4 pb-2.5 pt-[calc(14px+env(safe-area-inset-top,0px))]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          {title ? (
            <h1 className="text-lg font-bold text-app-light">{title}</h1>
          ) : (
            <button
              type="button"
              className="flex items-center"
              onClick={handleBrandClick}
              aria-label="Ir al inicio"
            >
              <AppBrand />
            </button>
          )}
        </div>
        <div className="inline-flex items-center gap-2">
          <WorkspaceSwitcher />
          {isAdmin ? (
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/80 transition-colors hover:border-white/35 hover:bg-white/10 hover:text-white"
              aria-label={inAdminRoute ? 'Volver a la app' : 'Abrir acciones de admin'}
              onClick={() => navigate(inAdminRoute ? '/tabs/events' : '/admin')}
            >
              {inAdminRoute ? 'App' : 'Admin'}
            </button>
          ) : null}
          {title ? null : (
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-app-line bg-app-surface text-app-ink"
              aria-label="Buscar"
              onClick={() => navigate('/tabs/discover')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
            </button>
          )}
          {rightSlot}
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
