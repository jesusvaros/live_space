import React from 'react';

interface ProfileArtistLinksProps {
  linkWebsite: string;
  linkInstagram: string;
  linkSpotify: string;
}

const ProfileArtistLinks: React.FC<ProfileArtistLinksProps> = ({
  linkWebsite,
  linkInstagram,
  linkSpotify,
}) => {
  if (!linkWebsite && !linkInstagram && !linkSpotify) return null;

  return (
    <div
      className="space-y-3 rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/95 to-slate-950/95 p-4 shadow-[0_24px_50px_rgba(0,0,0,0.35)]"
      style={{ animationDelay: '0.16s' }}
    >
      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Artist links</p>
      <div className="space-y-2 text-sm text-slate-300">
        {linkWebsite && (
          <a
            href={linkWebsite}
            target="_blank"
            rel="noreferrer"
            className="block text-slate-200 hover:text-slate-50 transition-colors"
          >
            {linkWebsite.replace(/^https?:\/\//, '')}
          </a>
        )}
        {linkInstagram && (
          <a
            href={linkInstagram}
            target="_blank"
            rel="noreferrer"
            className="block text-slate-200 hover:text-slate-50 transition-colors"
          >
            {linkInstagram.replace(/^https?:\/\//, '')}
          </a>
        )}
        {linkSpotify && (
          <a
            href={linkSpotify}
            target="_blank"
            rel="noreferrer"
            className="block text-slate-200 hover:text-slate-50 transition-colors"
          >
            {linkSpotify.replace(/^https?:\/\//, '')}
          </a>
        )}
      </div>
    </div>
  );
};

export default ProfileArtistLinks;
