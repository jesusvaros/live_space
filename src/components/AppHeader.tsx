import React from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import AppBrand from './AppBrand';
import { IconBell } from './icons';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import { useAuth } from '../contexts/AuthContext';

export type AppHeaderProps = {
  title?: string;
  rightSlot?: React.ReactNode;
  showBack?: boolean;
};

const AppHeader: React.FC<AppHeaderProps> = ({ title, rightSlot, showBack }) => {
  const history = useHistory();
  const location = useLocation();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const inAdminRoute = location.pathname.startsWith('/admin');
  void showBack;

  const handleBrandClick = () => {
    history.push('/');
  };

  return (
    <header className="sticky top-0 z-[1200] bg-app-bg px-4 py-3 pt-[calc(12px+env(safe-area-inset-top,0px))]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          {title ? (
            <h1 className="text-lg font-bold text-app-light">{title}</h1>
          ) : (
            <button
              type="button"
              className="flex items-center"
              onClick={handleBrandClick}
              aria-label="Go to home"
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
              aria-label={inAdminRoute ? 'Back to main' : 'Open admin actions'}
              onClick={() => history.push(inAdminRoute ? '/tabs/events' : '/admin')}
            >
              {inAdminRoute ? 'Main' : 'Admin'}
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex items-center justify-center px-3 py-2 text-sm font-semibold text-white/80 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Notifications"
            disabled
          >
            <IconBell className="h-4 w-4" />
          </button>
          {rightSlot}
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
