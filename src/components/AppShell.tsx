import React from 'react';
import { Content, Page } from './ui/AppPrimitives';
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
    <Page>
      {headerPlacement === 'outside' ? headerNode : null}
      <Content fullscreen={contentFullscreen} className={contentClassName}>
        {contentWrapperClassName === false ? content : <div className={contentWrapperClassName}>{content}</div>}
      </Content>
    </Page>
  );
};

export default AppShell;
