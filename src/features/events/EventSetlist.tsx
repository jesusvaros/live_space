import React from 'react';
import { useNavigate } from 'react-router-dom';
import SetlistAttribution from '../../components/event/SetlistAttribution';
import GeneratedPoster from '../../components/ui/GeneratedPoster';
import type { EventSetlistEntry } from '../../lib/types';
import type { Clip, TimelineMoment } from '../moments/concertTimeline';
import SetlistCredit from '../setlist/SetlistCredit';
import SetlistProposalAction from '../setlist/SetlistProposalAction';

// The setlist of a concert that already happened, song by song: each song
// with its clips (tap: play them) or «¿La grabaste?», the setlist's source
// and the audience proposal. On the concert page it lives in the player's
// «Setlist» sheet, or below the poster when there is nothing to play yet.

const pad = (value: number) => value.toString().padStart(2, '0');

export const momentThumb = (moment: TimelineMoment) =>
  moment.thumbnailUrl || (moment.mediaType === 'image' ? moment.mediaUrl : null);

type EventSetlistProps = {
  eventId: string;
  startsAt: string;
  setlist: EventSetlistEntry[];
  clipsBySong: Map<string, Clip[]>;
  playingSongId: string | null;
  fallbackTitle: string;
  attendance: 'going' | 'attended' | null;
  onPlayClip: (clip: Clip) => void;
  onUpload: (songOrdinal: number) => void;
  onSetlistApplied: () => void;
};

const EventSetlist: React.FC<EventSetlistProps> = ({
  eventId,
  startsAt,
  setlist,
  clipsBySong,
  playingSongId,
  fallbackTitle,
  attendance,
  onPlayClip,
  onUpload,
  onSetlistApplied,
}) => (
  <>
    {setlist.length === 0 ? (
      <p className="px-4 pt-1 text-sm text-white/60">Aún no hay setlist: los momentos van por orden de hora.</p>
    ) : (
      <ol className="mt-2.5 flex flex-col gap-1 px-4">
        {setlist.map((entry, index) => {
          const songClips = entry.song_id ? clipsBySong.get(entry.song_id) || [] : [];
          const current = Boolean(entry.song_id && entry.song_id === playingSongId);
          const last = index === setlist.length - 1;
          return (
            <li
              key={entry.ordinal}
              aria-current={current ? 'true' : undefined}
              className={`flex min-h-[60px] items-center gap-3 ${
                current
                  ? '-mx-2.5 rounded-xl bg-app-accent/[0.12] px-2.5 py-2'
                  : `py-2 ${last ? '' : 'border-b border-app-line'}`
              }`}
            >
              <span className={`w-6 font-mono text-[12px] font-semibold ${current ? 'text-app-accent' : 'text-[#8f8b84]'}`}>
                {pad(entry.ordinal)}
              </span>
              <span className={`min-w-0 flex-1 truncate text-[15px] ${current ? 'font-bold text-app-accent' : 'font-semibold text-app-ink'}`}>
                {entry.song_title || 'Canción sin título'}
              </span>
              {songClips.length > 0 ? (
                <button
                  type="button"
                  className="flex min-h-11 items-center"
                  aria-label={`Ver ${songClips.length} momentos de ${entry.song_title || 'esta canción'}`}
                  onClick={() => onPlayClip(songClips[0])}
                >
                  {songClips.slice(0, 3).map((clip, thumbIndex) => {
                    const thumb = momentThumb(clip.moment);
                    return (
                      <span
                        key={clip.id}
                        className={`relative h-11 w-[34px] overflow-hidden rounded-md border-2 bg-app-surface ${
                          current && thumbIndex === 0 ? 'border-app-accent' : 'border-app-bg'
                        } ${thumbIndex > 0 ? '-ml-2.5' : ''}`}
                      >
                        {thumb ? (
                          <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <GeneratedPoster title={entry.song_title || fallbackTitle} variant="thumb" />
                        )}
                      </span>
                    );
                  })}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onUpload(entry.ordinal)}
                  className="min-h-11 shrink-0 rounded-full border border-dashed border-app-line px-3 text-xs font-semibold text-[#c9c5bd]"
                >
                  ¿La grabaste?
                </button>
              )}
            </li>
          );
        })}
      </ol>
    )}
    {setlist.some(entry => entry.source === 'setlistfm') && (
      <div className="px-4">
        <SetlistAttribution url={setlist.find(entry => entry.source_url)?.source_url} />
      </div>
    )}
    <SetlistCredit setlist={setlist} className="px-4" />
    <SetlistProposalAction
      eventId={eventId}
      startsAt={startsAt}
      setlist={setlist}
      attendance={attendance}
      onApplied={onSetlistApplied}
      className="px-4 pt-3"
    />
  </>
);

type UnplacedMomentsProps = {
  moments: TimelineMoment[];
  fallbackTitle: string;
};

/** «Sin hora exacta»: moments we cannot place on the timeline. */
export const UnplacedMoments: React.FC<UnplacedMomentsProps> = ({ moments, fallbackTitle }) => {
  const navigate = useNavigate();
  if (moments.length === 0) return null;
  return (
    <div className="px-4 pt-5">
      <h2 className="font-display text-base font-bold text-app-ink">Sin hora exacta</h2>
      <p className="mt-0.5 text-[12px] text-white/50">No sabemos cuándo se grabaron, así que no están en la línea de tiempo.</p>
      <div className="-mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {moments.map(moment => {
          const thumb = momentThumb(moment);
          return (
            <button
              key={moment.id}
              type="button"
              onClick={() => navigate(`/post/${moment.id}`)}
              aria-label={`Ver momento de @${moment.userName || 'anónimo'}`}
              className="relative h-[92px] w-[64px] shrink-0 overflow-hidden rounded-xl border border-app-line bg-app-surface"
            >
              {thumb ? (
                <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <GeneratedPoster title={fallbackTitle} variant="thumb" />
              )}
              <span className="absolute inset-x-1 bottom-1 truncate text-left text-[10px] font-semibold text-white drop-shadow">
                @{moment.userName || 'anónimo'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default EventSetlist;
