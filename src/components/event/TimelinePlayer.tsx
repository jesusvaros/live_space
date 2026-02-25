import React, { useEffect, useMemo, useRef } from 'react';
import { IonSpinner } from '@ionic/react';
import { PostWithSetlist } from '../../lib/types';
import TimelineScrubber, { TimelineBucket } from './TimelineScrubber';
import SecondStack from './SecondStack';

export type MediaFilter = 'all' | 'video' | 'image';

type TimelinePlayerProps = {
  buckets: TimelineBucket[];
  selectedBucketIndex: number;
  selectedMomentIndex: number;
  moments: PostWithSetlist[];
  loading: boolean;
  totalMoments: number;
  eventStart: Date | null;
  mediaFilter: MediaFilter;
  onSelectBucket: (index: number) => void;
  onSelectMoment: (index: number) => void;
  onAddMoments?: () => void;
  onFilterChange: (filter: MediaFilter) => void;
  autoAdvance?: boolean;
  onRequestNext?: () => void;
};

const formatRelative = (seconds: number) => {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) {
    return `+${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }
  return `+${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const formatBucketLabel = (bucketTime: string | null, eventStart: Date | null) => {
  if (!bucketTime) return '';
  const bucketDate = new Date(bucketTime);
  if (eventStart) {
    const diff = (bucketDate.getTime() - eventStart.getTime()) / 1000;
    return formatRelative(diff);
  }
  return bucketDate.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatMomentLabel = (moment: PostWithSetlist | null, eventStart: Date | null) => {
  if (!moment) return '';
  const timestamp = moment.captured_at || moment.created_at;
  const date = new Date(timestamp);
  if (eventStart) {
    const diff = (date.getTime() - eventStart.getTime()) / 1000;
    return formatRelative(diff);
  }
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const TimelinePlayer: React.FC<TimelinePlayerProps> = ({
  buckets,
  selectedBucketIndex,
  selectedMomentIndex,
  moments,
  loading,
  totalMoments,
  eventStart,
  mediaFilter,
  onSelectBucket,
  onSelectMoment,
  onAddMoments,
  onFilterChange,
  autoAdvance,
  onRequestNext,
}) => {
  const selectedBucket = buckets[selectedBucketIndex] ?? null;
  const selectedMoment = moments[selectedMomentIndex] ?? null;
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!selectedMoment || selectedMoment.media_type !== 'video') return;
    const video = videoRef.current;
    if (!video) return;
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  }, [selectedMoment?.id]);

  const selectedBucketLabel = useMemo(
    () => formatBucketLabel(selectedBucket?.bucket_time ?? null, eventStart),
    [selectedBucket?.bucket_time, eventStart]
  );

  const selectedMomentLabel = useMemo(
    () => formatMomentLabel(selectedMoment, eventStart),
    [selectedMoment, eventStart]
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/60">Timeline</p>
            <p className="mt-1.5 font-display text-2xl font-bold text-white">
              {selectedBucketLabel || '+00:00'}
            </p>
            {totalMoments > 0 && <p className="mt-1 text-xs text-white/55">{totalMoments} moments</p>}
          </div>
          <div className="inline-flex items-center rounded-full border border-white/15 bg-black/25 p-1">
            {(['all', 'video', 'image'] as MediaFilter[]).map(filter => (
              <button
                key={filter}
                type="button"
                className={`rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] transition-all ${
                  mediaFilter === filter
                    ? 'bg-app-accent text-white shadow-[0_4px_10px_rgba(255,107,74,0.22)]'
                    : 'text-white/60 hover:text-white'
                }`}
                onClick={() => onFilterChange(filter)}
              >
                {filter === 'all' ? 'All' : filter === 'video' ? 'Video' : 'Photos'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="-mx-4 px-4">
        <div className={`relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black/70 ${loading ? 'opacity-90' : ''}`}>
          {loading ? (
            <div className="flex h-full items-center justify-center bg-white/[0.03]">
              <IonSpinner name="crescent" />
            </div>
          ) : selectedMoment ? (
            <div
              key={selectedMoment.id}
              className="relative h-full w-full animate-[timeline-fade_0.35s_ease]"
              onClick={() => {
                const video = videoRef.current;
                if (!video) return;
                if (video.paused) {
                  video.play().catch(() => {});
                } else {
                  video.pause();
                }
              }}
            >
              {selectedMoment.media_type === 'video' ? (
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="h-full w-full object-cover"
                  onEnded={() => {
                    if (autoAdvance && onRequestNext) {
                      onRequestNext();
                    }
                  }}
                  poster={selectedMoment.thumbnail_url || undefined}
                >
                  <source src={selectedMoment.media_url} />
                </video>
              ) : (
                <img src={selectedMoment.media_url} alt={selectedMoment.caption || 'Moment'} className="h-full w-full object-cover" />
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent p-4">
                {selectedMoment.resolved_song_title && (
                  <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/45 px-2.5 py-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/80">
                      {selectedMoment.resolved_song_title}
                    </span>
                  </div>
                )}
                <p className="text-xs text-white/65">{selectedMomentLabel}</p>
                <h4 className="mt-1.5 font-display text-lg font-bold text-white">
                  {selectedMoment.actor_name ||
                    selectedMoment.profiles?.display_name ||
                    selectedMoment.profiles?.username ||
                    'Anonymous'}
                </h4>
              </div>
            </div>
          ) : (
            <div className="flex min-h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-lg font-semibold text-white">No moments yet.</p>
              <span className="text-xs text-white/55">Relive the show by adding the first clip.</span>
              {onAddMoments && (
                <button
                  type="button"
                  className="mt-2 inline-flex items-center rounded-full border border-app-accent/40 bg-app-accent/20 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-app-accent"
                  onClick={onAddMoments}
                >
                  Add the first moment
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <TimelineScrubber
        buckets={buckets}
        selectedIndex={selectedBucketIndex}
        onSelectIndex={onSelectBucket}
        eventStart={eventStart}
        gapThresholdSeconds={120}
      />

      <SecondStack
        moments={moments}
        selectedIndex={selectedMomentIndex}
        onSelect={onSelectMoment}
      />
    </section>
  );
};

export default TimelinePlayer;
