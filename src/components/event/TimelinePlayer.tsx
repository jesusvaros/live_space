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
    <section className="timeline-player">
      <div className="timeline-meta">
        <div>
          <p className="timeline-kicker">Timeline</p>
          <p className="timeline-time">{selectedBucketLabel || '+00:00'}</p>
        </div>
        <div className="timeline-meta-right">
          {totalMoments > 0 && (
            <span className="timeline-count">{totalMoments} moments</span>
          )}
          <div className="timeline-filter">
            {(['all', 'video', 'image'] as MediaFilter[]).map(filter => (
              <button
                key={filter}
                type="button"
                className={`timeline-filter-btn ${mediaFilter === filter ? 'is-active' : ''}`}
                onClick={() => onFilterChange(filter)}
              >
                {filter === 'all' ? 'All' : filter === 'video' ? 'Video' : 'Photos'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`timeline-surface ${loading ? 'is-loading' : ''}`}>
        {loading ? (
          <div className="timeline-loading">
            <IonSpinner name="crescent" />
          </div>
        ) : selectedMoment ? (
          <div
            key={selectedMoment.id}
            className="timeline-surface-media"
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
              <img src={selectedMoment.media_url} alt={selectedMoment.caption || 'Moment'} />
            )}
            <div className="timeline-surface-overlay">
              <p>{selectedMomentLabel}</p>
              <h4>
                {selectedMoment.profiles?.display_name ||
                  selectedMoment.profiles?.username ||
                  'Anonymous'}
              </h4>
            </div>
          </div>
        ) : (
          <div className="timeline-empty">
            <p>No moments yet.</p>
            <span>Relive the show by adding the first clip.</span>
            {onAddMoments && (
              <button type="button" className="timeline-empty-cta" onClick={onAddMoments}>
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
