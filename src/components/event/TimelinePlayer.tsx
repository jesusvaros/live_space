import React, { useEffect, useMemo, useRef } from 'react';
import { IonSpinner } from '@ionic/react';
import { PostWithRelations } from '../../lib/types';
import TimelineScrubber, { TimelineBucket } from './TimelineScrubber';
import SecondStack from './SecondStack';

export type MediaFilter = 'all' | 'video' | 'image';

type TimelinePlayerProps = {
  buckets: TimelineBucket[];
  selectedBucketIndex: number;
  selectedMomentIndex: number;
  moments: PostWithRelations[];
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

const formatMomentLabel = (moment: PostWithRelations | null, eventStart: Date | null) => {
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
          <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Timeline</p>
          <p className="mt-1.5 font-display text-lg font-semibold text-slate-50">
            {selectedBucketLabel || '+00:00'}
          </p>
        </div>
        <div className="inline-flex items-center gap-3">
          {totalMoments > 0 && <span className="text-xs text-slate-400">{totalMoments} moments</span>}
          <div className="inline-flex gap-1 rounded-full border border-white/10 bg-white/5 p-1">
            {(['all', 'video', 'image'] as MediaFilter[]).map(filter => (
              <button
                key={filter}
                type="button"
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] transition ${
                  mediaFilter === filter
                    ? 'bg-[#ff6b4a]/25 text-[#ffd1c4]'
                    : 'text-slate-400'
                }`}
                onClick={() => onFilterChange(filter)}
              >
                {filter === 'all' ? 'All' : filter === 'video' ? 'Video' : 'Photos'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className={`relative aspect-video overflow-hidden rounded-[26px] shadow-[0_24px_50px_rgba(0,0,0,0.45)] ${
          loading
            ? 'bg-[#0f1420]'
            : 'bg-[radial-gradient(circle_at_30%_20%,rgba(255,107,74,0.18),rgba(13,17,27,0.95))]'
        }`}
      >
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
            <div className="absolute inset-0 flex flex-col justify-end bg-[linear-gradient(180deg,rgba(0,0,0,0.05)_45%,rgba(0,0,0,0.75)_100%)] p-4">
              <p className="text-xs text-white/70">{selectedMomentLabel}</p>
              <h4 className="mt-1.5 text-lg font-semibold text-slate-50">
                {selectedMoment.profiles?.display_name ||
                  selectedMoment.profiles?.username ||
                  'Anonymous'}
              </h4>
            </div>
          </div>
        ) : (
          <div className="flex min-h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-lg text-slate-50">No moments yet.</p>
            <span className="text-xs text-slate-400">Relive the show by adding the first clip.</span>
            {onAddMoments && (
              <button
                type="button"
                className="mt-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#ffd1c4]"
                onClick={onAddMoments}
              >
                Add the first moment
              </button>
            )}
          </div>
        )}
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
