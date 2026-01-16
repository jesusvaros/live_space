import React from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import AppBrand from './AppBrand';
import { IconBell, IconChevronLeft } from './icons';

type AppHeaderProps = {
  rightSlot?: React.ReactNode;
  showBack?: boolean;
};

const AppHeader: React.FC<AppHeaderProps> = ({ rightSlot, showBack }) => {
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
    <header className="app-header">
      <div className="app-header-inner">
        <div className="app-header-left">
          {shouldShowBack ? (
            <button
              type="button"
              className="app-button app-button--ghost app-button--small"
              onClick={handleBackClick}
              aria-label="Go back"
            >
              <IconChevronLeft className="app-icon" />
            </button>
          ) : null}
          <button
            type="button"
            className="app-header-brand"
            onClick={handleBrandClick}
            aria-label="Go to home"
          >
            <AppBrand />
          </button>
        </div>
        <div className="app-header-actions">
          <button
            type="button"
            className="app-button app-button--ghost app-button--small"
            aria-label="Notifications"
            disabled
          >
            <IconBell className="app-icon" />
          </button>
          {rightSlot}
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
