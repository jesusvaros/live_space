import React, { useEffect, useRef, useState } from 'react';
import { Event, VenuePlace } from '../../lib/types';
import { useIonRouter } from '@ionic/react';
import { IconBookmark, IconTicket } from '../icons';

type SelectionItem = { type: 'event' | 'venue'; id: string };

type MapSelectionSheetProps = {
  activeItem: SelectionItem | null;
  events: (Event & { venue_place?: VenuePlace | null; event_artists?: { artist?: { name?: string | null } | null }[] })[];
  venues: VenuePlace[];
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onFollowEvent?: (eventId: string) => void;
  onSetAttendance?: (eventId: string, status: 'going' | 'attended') => void;
  followedEventIds?: Set<string>;
  attendanceStatusByEventId?: Record<string, 'going' | 'attended'>;
  followPendingEventIds?: Set<string>;
  attendancePendingEventIds?: Set<string>;
};

const MapSelectionSheet: React.FC<MapSelectionSheetProps> = ({
  activeItem,
  events,
  venues,
  onTouchStart,
  onTouchEnd,
  onFollowEvent,
  onSetAttendance,
  followedEventIds,
  attendanceStatusByEventId,
  followPendingEventIds,
  attendancePendingEventIds,
}) => {
  const router = useIonRouter();
  const [followAnimating, setFollowAnimating] = useState(false);
  const [attendanceAnimating, setAttendanceAnimating] = useState(false);
  const followTimerRef = useRef<number | null>(null);
  const attendanceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (followTimerRef.current) window.clearTimeout(followTimerRef.current);
      if (attendanceTimerRef.current) window.clearTimeout(attendanceTimerRef.current);
    };
  }, []);

  const triggerActionFx = (action: 'follow' | 'attendance') => {
    if (action === 'follow') {
      setFollowAnimating(false);
      if (followTimerRef.current) window.clearTimeout(followTimerRef.current);
      window.requestAnimationFrame(() => {
        setFollowAnimating(true);
        followTimerRef.current = window.setTimeout(() => setFollowAnimating(false), 420);
      });
      return;
    }

    setAttendanceAnimating(false);
    if (attendanceTimerRef.current) window.clearTimeout(attendanceTimerRef.current);
    window.requestAnimationFrame(() => {
      setAttendanceAnimating(true);
      attendanceTimerRef.current = window.setTimeout(() => setAttendanceAnimating(false), 420);
    });
  };

  const baseSheetChipClass = 'relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/90 backdrop-blur-md transition-all duration-200 hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none';
  const neutralSheetChipClass = 'border-white/25 bg-[linear-gradient(145deg,rgba(3,6,12,0.78),rgba(9,15,26,0.86))]';
  const followActiveSheetChipClass = 'border-[#ff6b4a]/80 bg-[linear-gradient(140deg,rgba(255,107,74,0.3),rgba(255,107,74,0.16)_65%,rgba(13,18,30,0.88))] text-white shadow-[0_0_0_1px_rgba(255,107,74,0.24),0_10px_22px_rgba(0,0,0,0.28)]';
  const attendanceActiveSheetChipClass = 'border-[#25d47b]/80 bg-[linear-gradient(140deg,rgba(37,212,123,0.28),rgba(37,212,123,0.14)_65%,rgba(13,18,30,0.88))] text-white shadow-[0_0_0_1px_rgba(37,212,123,0.24),0_10px_22px_rgba(0,0,0,0.28)]';
  const attendancePastActiveSheetChipClass = 'border-[#f3bf4a]/80 bg-[linear-gradient(140deg,rgba(243,191,74,0.26),rgba(243,191,74,0.13)_65%,rgba(13,18,30,0.88))] text-white shadow-[0_0_0_1px_rgba(243,191,74,0.25),0_10px_22px_rgba(0,0,0,0.28)]';

  if (!activeItem) return null;

  const renderDetails = () => {
    if (activeItem.type === 'event') {
      const ev = events.find(e => e.id === activeItem.id);
      if (!ev) return null;
      const artists = (ev.event_artists || []).map(a => a.artist?.name).filter(Boolean).join(', ');
      const start = new Date(ev.starts_at);
      const end = ev.ends_at ? new Date(ev.ends_at) : new Date(start.getTime() + 6 * 60 * 60 * 1000);
      const isPastEvent = Date.now() > end.getTime();
      const attendanceLabel = isPastEvent ? 'Went' : 'Going';
      const attendanceStatus: 'going' | 'attended' = isPastEvent ? 'attended' : 'going';
      const isFollowed = followedEventIds?.has(ev.id) ?? false;
      const currentAttendance = attendanceStatusByEventId?.[ev.id] || null;
      const isAttendanceActive = currentAttendance === attendanceStatus;
      const followLoading = followPendingEventIds?.has(ev.id) ?? false;
      const attendanceLoading = attendancePendingEventIds?.has(ev.id) ?? false;
      return (
        <div className="flex gap-4">
          <div className="relative flex-shrink-0">
            {ev.cover_image_url ? (
              <img
                src={ev.cover_image_url}
                alt={ev.name}
                className="h-80 w-48 rounded-xl object-cover"
              />
            ) : (
              <div className="h-80 w-48 rounded-xl bg-white/10" />
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div 
              className="flex min-w-0 flex-1 flex-col justify-center cursor-pointer transition-opacity hover:opacity-80"
              onClick={() => router.push(`/event/${ev.id}`, 'forward')}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Event</p>
              <h3 className="mt-2 font-display text-2xl font-bold text-white leading-tight">{ev.name}</h3>
              {ev.venue_place?.name && (
                <p className="mt-1 text-sm font-medium text-white/80">{ev.venue_place.name}</p>
              )}
              <p className="mt-1 text-sm text-white/70">{ev.venue_place?.city || ev.city}</p>
              {artists && <p className="mt-2 text-sm text-white/55">{artists}</p>}
              <p className="mt-3 text-sm text-white/55">
                {new Date(ev.starts_at).toLocaleString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                className={`${baseSheetChipClass} ${isFollowed ? followActiveSheetChipClass : neutralSheetChipClass} ${
                  followAnimating ? 'scale-[1.02]' : ''
                }`}
                aria-label="Follow event"
                disabled={followLoading}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerActionFx('follow');
                  onFollowEvent?.(ev.id);
                }}
              >
                <span
                  className={`pointer-events-none absolute inset-0 rounded-full border border-current ${
                    followAnimating ? 'animate-ping opacity-40 motion-reduce:animate-none' : 'opacity-0'
                  }`}
                />
                <span className={`inline-flex items-center justify-center ${followAnimating ? 'animate-pulse motion-reduce:animate-none' : ''}`}>
                  <IconBookmark className="h-[19px] w-[19px]" />
                </span>
                <span>Follow</span>
              </button>
              <button
                type="button"
                className={`${baseSheetChipClass} ${
                  isAttendanceActive
                    ? isPastEvent
                      ? attendancePastActiveSheetChipClass
                      : attendanceActiveSheetChipClass
                    : neutralSheetChipClass
                } ${attendanceAnimating ? 'scale-[1.02]' : ''}`}
                aria-label={attendanceLabel}
                disabled={attendanceLoading}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerActionFx('attendance');
                  onSetAttendance?.(ev.id, attendanceStatus);
                }}
              >
                <span
                  className={`pointer-events-none absolute inset-0 rounded-full border border-current ${
                    attendanceAnimating ? 'animate-ping opacity-40 motion-reduce:animate-none' : 'opacity-0'
                  }`}
                />
                <span className={`inline-flex items-center justify-center ${attendanceAnimating ? 'animate-pulse motion-reduce:animate-none' : ''}`}>
                  <IconTicket className="h-[19px] w-[19px]" />
                </span>
                <span>{attendanceLabel}</span>
              </button>
            </div>
          </div>
        </div>
      );
    }
    const venue = venues.find(v => v.id === activeItem.id);
    if (!venue) return null;
    return (
      <div 
        className="cursor-pointer transition-opacity hover:opacity-80"
        onClick={() => router.push(`/venue/${venue.id}`, 'forward')}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Venue</p>
        <h3 className="mt-2 font-display text-xl font-bold text-white">{venue.name}</h3>
        <p className="text-sm text-white/70">{venue.city}</p>
        <p className="mt-2 text-xs font-medium text-white/40">Tap to view venue details</p>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[1100] max-h-[60vh] rounded-t-3xl bg-black/92 p-4"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="mb-3 flex items-center justify-center">
        <div className="h-1 w-12 rounded-full bg-white/20" />
      </div>
      {renderDetails()}
    </div>
  );
};

export default MapSelectionSheet;
