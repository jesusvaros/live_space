import React from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import AppBrand from './AppBrand';
import { IconBell, IconChevronLeft } from './icons';
import WorkspaceSwitcher from './WorkspaceSwitcher';

type AppHeaderProps = {
  title?: string;
  rightSlot?: React.ReactNode;
  showBack?: boolean;
};

const AppHeader: React.FC<AppHeaderProps> = ({ title, rightSlot, showBack }) => {
  const history = useHistory();
  const location = useLocation();

  // Determine if we should show back button
  const shouldShowBack = showBack ?? !['/tabs/feed', '/tabs/events', '/tabs/map', '/tabs/upload', '/tabs/profile'].includes(location.pathname);

  const handleBrandClick = () => {
    history.push('/');
  };

  const handleBackClick = () => {
    history.goBack();
  };

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b0e14]/85 px-4 py-3 pt-[calc(12px+env(safe-area-inset-top,0px))] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          {shouldShowBack ? (
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full px-3 py-2 text-sm font-semibold text-[#ffd1c4] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleBackClick}
              aria-label="Go back"
            >
              <IconChevronLeft className="h-4 w-4" />
            </button>
          ) : null}
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
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full px-3 py-2 text-sm font-semibold text-[#ffd1c4] disabled:cursor-not-allowed disabled:opacity-60"
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
