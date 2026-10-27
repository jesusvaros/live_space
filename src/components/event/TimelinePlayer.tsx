import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Spinner } from '../ui/AppPrimitives';
import { PostWithSetlist } from '../../lib/types';
import TimelineScrubber, { TimelineBucket } from './TimelineScrubber';
import SecondStack from './SecondStack';
import { ExternalMomentCard, isExternalPost } from '../../features/socialImport';

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
  // Text over the bottom of the stage ("Suena ahora · 07 ...").
  renderCaption?: (moment: PostWithSetlist | null) => React.ReactNode;
  // Chip at the top right of the stage, next to the page's back button.
  stageChip?: React.ReactNode;
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
  return bucketDate.toLocaleTimeString('es-ES', {
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
  return date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

// The concert's moments in time order: a stage with the selected moment, the
// scrubber over the timeline and the moments that share the same second.
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
  renderCaption,
  stageChip,
}) => {
  const selectedBucket = buckets[selectedBucketIndex] ?? null;
  const selectedMoment = moments[selectedMomentIndex] ?? null;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [paused, setPaused] = useState(true);

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

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  return (
    <section className="flex flex-col">
      <div className={`relative h-[300px] overflow-hidden bg-black ${loading ? 'opacity-90' : ''}`}>
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : selectedMoment ? (
          <div
            key={selectedMoment.id}
            className="absolute inset-0 animate-[timeline-fade_0.35s_ease] motion-reduce:animate-none"
            onClick={togglePlayback}
          >
            {isExternalPost(selectedMoment) ? (
              <ExternalMomentCard post={selectedMoment} variant="media" />
            ) : selectedMoment.media_type === 'video' ? (
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="h-full w-full object-cover"
                onPlay={() => setPaused(false)}
                onPause={() => setPaused(true)}
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
              <img src={selectedMoment.media_url} alt={selectedMoment.caption || 'Momento'} className="h-full w-full object-cover" />
            )}
          </div>
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,91,46,0.25),transparent_60%)]" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,#0d0e12_2%,rgba(13,14,18,0)_50%,rgba(13,14,18,0.5))]" />
        {stageChip ? (
          <div className="pointer-events-none absolute right-3 top-[calc(18px+env(safe-area-inset-top,0px))] z-[1301] max-w-[70%]">
            {stageChip}
          </div>
        ) : null}
        {selectedMoment?.media_type === 'video' && !isExternalPost(selectedMoment) && paused && !loading ? (
          <button
            type="button"
            aria-label="Reproducir"
            onClick={togglePlayback}
            className="absolute left-1/2 top-[46%] flex h-[60px] w-[60px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-app-ink/90 text-app-bg"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5l12 7-12 7z" />
            </svg>
          </button>
        ) : null}
        <div className="pointer-events-none absolute inset-x-4 bottom-2">
          {renderCaption ? renderCaption(selectedMoment) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 pt-3">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[12px] font-semibold text-white/60">
            {selectedMoment ? selectedMomentLabel || selectedBucketLabel : '+00:00'}
            {totalMoments > 0 ? ` · ${totalMoments} momentos` : ''}
          </p>
          <div className="inline-flex items-center rounded-full border border-app-line bg-app-surface p-0.5">
            {(['all', 'video', 'image'] as MediaFilter[]).map(filter => (
              <button
                key={filter}
                type="button"
                aria-pressed={mediaFilter === filter}
                className={`min-h-8 rounded-full px-2.5 text-[12px] font-semibold transition-colors ${
                  mediaFilter === filter ? 'bg-app-ink text-app-bg' : 'text-white/60 hover:text-white'
                }`}
                onClick={() => onFilterChange(filter)}
              >
                {filter === 'all' ? 'Todo' : filter === 'video' ? 'Vídeos' : 'Fotos'}
              </button>
            ))}
          </div>
        </div>

        {!loading && !selectedMoment && onAddMoments ? (
          <button type="button" className="self-start text-sm font-semibold text-app-accent" onClick={onAddMoments}>
            Aún no hay momentos. Sube el primero
          </button>
        ) : null}

        {buckets.length > 1 ? (
          <TimelineScrubber
            buckets={buckets}
            selectedIndex={selectedBucketIndex}
            onSelectIndex={onSelectBucket}
            eventStart={eventStart}
            gapThresholdSeconds={120}
          />
        ) : null}

        <SecondStack moments={moments} selectedIndex={selectedMomentIndex} onSelect={onSelectMoment} />
      </div>
    </section>
  );
};

export default TimelinePlayer;
