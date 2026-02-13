import React from 'react';
import { IonContent, IonPage } from '@ionic/react';
import AppHeader, { AppHeaderProps } from './AppHeader';

type AppShellProps = {
  children: React.ReactNode;
  headerProps?: AppHeaderProps | null;
  headerPlacement?: 'inside' | 'outside';
  contentClassName?: string;
  contentFullscreen?: boolean;
  contentWrapperClassName?: string | false;
};

const AppShell: React.FC<AppShellProps> = ({
  children,
  headerProps = {},
  headerPlacement = 'inside',
  contentClassName,
  contentFullscreen = true,
  contentWrapperClassName = 'min-h-full',
}) => {
  const headerNode = headerProps ? <AppHeader {...headerProps} /> : null;
  const content = (
    <>
      {headerPlacement === 'inside' ? headerNode : null}
      {children}
    </>
  );

  return (
    <IonPage>
      {headerPlacement === 'outside' ? headerNode : null}
      <IonContent fullscreen={contentFullscreen} className={contentClassName}>
        {contentWrapperClassName === false ? (
          content
        ) : (
          <div className={contentWrapperClassName}>{content}</div>
        )}
      </IonContent>
    </IonPage>
  );
};

export default AppShell;
