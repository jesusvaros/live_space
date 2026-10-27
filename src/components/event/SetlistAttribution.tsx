import React from 'react';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

// setlist.fm's API terms require a visible link back on every setlist taken
// from them. Shown under the setlist when its items have source = 'setlistfm'.
const SETLISTFM_HOME = 'https://www.setlist.fm';

const SetlistAttribution: React.FC<{ url?: string | null }> = ({ url }) => {
  const href = url && url.startsWith('https://www.setlist.fm/') ? url : SETLISTFM_HOME;
  const open = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!Capacitor.isNativePlatform()) return;
    event.preventDefault();
    void Browser.open({ url: href });
  };
  return (
    <p className="mt-3 text-[11px] text-white/45">
      Setlist:{' '}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={open}
        className="inline-flex min-h-11 items-center underline decoration-white/30 underline-offset-2 hover:text-white/70"
      >
        setlist.fm
      </a>
    </p>
  );
};

export default SetlistAttribution;
