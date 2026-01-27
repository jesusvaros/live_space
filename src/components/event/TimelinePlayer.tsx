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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Timeline</p>
          <p className="mt-1.5 font-display text-lg font-bold text-white">
            {selectedBucketLabel || '+00:00'}
          </p>
        </div>
        <div className="inline-flex items-center gap-3">
          {totalMoments > 0 && <span className="text-xs text-white/55">{totalMoments} moments</span>}
          <div className="inline-flex gap-4 bg-white/10 px-3 py-2">
            {(['all', 'video', 'image'] as MediaFilter[]).map(filter => (
              <button
                key={filter}
                type="button"
                className={`text-[10px] font-semibold uppercase tracking-[0.22em] transition-colors ${
                  mediaFilter === filter ? 'text-app-accent' : 'text-white/55 hover:text-white/80'
                }`}
                onClick={() => onFilterChange(filter)}
              >
                {filter === 'all' ? 'All' : filter === 'video' ? 'Video' : 'Photos'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="-mx-4">
        <div className={`relative aspect-video overflow-hidden bg-black ${loading ? 'opacity-90' : ''}`}>
        {loading ? (
          <div className="flex h-full items-center justify-center">
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
            <div className="absolute inset-x-0 bottom-0 bg-black/70 p-4">
              {selectedMoment.resolved_song_title && (
                <div className="mb-2 inline-flex items-center gap-1.5 bg-black/60 px-2.5 py-1">
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
                className="mt-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-app-accent"
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
