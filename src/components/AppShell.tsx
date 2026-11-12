import React from 'react';
import { Content, Page } from './ui/AppPrimitives';
import AppHeader, { AppHeaderProps } from './AppHeader';
import UploadProgressPill from './UploadProgressPill';

type AppShellProps = {
  children: React.ReactNode;
  headerProps?: AppHeaderProps | null;
  headerPlacement?: 'inside' | 'outside';
  contentClassName?: string;
  contentFullscreen?: boolean;
  contentWrapperClassName?: string | false;
  contentRef?: React.Ref<HTMLElement>;
  /** The page shows the upload progress itself (a concert's upload button). */
  hideUploadPill?: boolean;
};

const AppShell: React.FC<AppShellProps> = ({
  children,
  headerProps = {},
  headerPlacement = 'inside',
  contentClassName,
  contentFullscreen = true,
  contentWrapperClassName = 'min-h-full',
  contentRef,
  hideUploadPill = false,
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
      <Content ref={contentRef} fullscreen={contentFullscreen} className={contentClassName}>
        {contentWrapperClassName === false ? content : <div className={contentWrapperClassName}>{content}</div>}
      </Content>
      {/* Background uploads (src/media/uploadQueue.ts); renders nothing when idle.
          Kept between the round back / share buttons pages put in the top
          corners (44 px at 16 px from the edge). */}
      <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+8px)] z-50 flex justify-center px-[68px]">
        {/* Still mounted when hidden: mounting it resumes saved uploads. */}
        <UploadProgressPill className={`pointer-events-auto w-full max-w-sm ${hideUploadPill ? 'hidden' : ''}`} />
      </div>
    </Page>
  );
};

export default AppShell;
