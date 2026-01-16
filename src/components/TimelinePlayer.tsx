import React, { useMemo } from 'react';
import { IonSpinner } from '@ionic/react';
import { PostWithRelations } from '../lib/types';

export type TimelineBucket = {
  bucket_time: string;
  moment_count: number;
};

type TimelinePlayerProps = {
  buckets: TimelineBucket[];
  selectedBucketIndex: number;
  selectedMomentIndex: number;
  moments: PostWithRelations[];
  loading: boolean;
  onSelectBucket: (index: number) => void;
  onSelectMoment: (index: number) => void;
};

const formatBucketLabel = (bucket: TimelineBucket | null) => {
  if (!bucket) return '';
  const date = new Date(bucket.bucket_time);
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const formatMomentTime = (moment: PostWithRelations | null) => {
  if (!moment) return '';
  const timestamp = moment.captured_at || moment.created_at;
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const TimelinePlayer: React.FC<TimelinePlayerProps> = ({
  buckets,
  selectedBucketIndex,
  selectedMomentIndex,
  moments,
  loading,
  onSelectBucket,
  onSelectMoment,
}) => {
  const selectedBucket = buckets[selectedBucketIndex] ?? null;
  const selectedMoment = moments[selectedMomentIndex] ?? null;

  const scrubberLabels = useMemo(() => {
    if (buckets.length === 0) return { start: '', end: '' };
    const start = new Date(buckets[0].bucket_time).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
    const end = new Date(buckets[buckets.length - 1].bucket_time).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
    return { start, end };
  }, [buckets]);

  return (
    <div className="timeline-player">
      <div className="timeline-stage">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <IonSpinner name="crescent" />
          </div>
        ) : selectedMoment ? (
          <>
            {selectedMoment.media_type === 'video' ? (
              <video controls playsInline poster={selectedMoment.thumbnail_url || undefined}>
                <source src={selectedMoment.media_url} />
              </video>
            ) : (
              <img src={selectedMoment.media_url} alt={selectedMoment.caption || 'Moment'} />
            )}
            <div className="timeline-stage-overlay">
              <p>{formatMomentTime(selectedMoment)}</p>
              <h4>
                {selectedMoment.profiles?.display_name ||
                  selectedMoment.profiles?.username ||
                  'Anonymous'}
              </h4>
            </div>
          </>
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-slate-400">
            No moments yet. Be the first to share.
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{formatBucketLabel(selectedBucket)}</span>
        <span>{selectedBucket ? `${selectedBucket.moment_count} moments` : ''}</span>
      </div>

      <div className="timeline-scrubber">
        <div className="scrubber-track">
          {buckets.map((bucket, index) => {
            const strength = bucket.moment_count >= 5 ? 3 : bucket.moment_count >= 3 ? 2 : 1;
            return (
              <button
                key={bucket.bucket_time}
                type="button"
                data-strength={strength}
                className={`scrubber-tick ${index === selectedBucketIndex ? 'is-active' : ''}`}
                onClick={() => onSelectBucket(index)}
              >
                <span className="sr-only">Moment at {formatBucketLabel(bucket)}</span>
              </button>
            );
          })}
        </div>
        {buckets.length > 1 && (
          <div className="scrubber-labels">
            <span>{scrubberLabels.start}</span>
            <span>{scrubberLabels.end}</span>
          </div>
        )}
      </div>

      {moments.length > 1 && (
        <div className="timeline-stack">
          {moments.map((moment, index) => (
            <button
              key={moment.id}
              type="button"
              className={`timeline-stack-item ${index === selectedMomentIndex ? 'is-active' : ''}`}
              onClick={() => onSelectMoment(index)}
            >
              {moment.media_type === 'video' ? (
                moment.thumbnail_url ? (
                  <img src={moment.thumbnail_url} alt={moment.caption || 'Moment'} />
                ) : (
                  <video muted preload="metadata">
                    <source src={moment.media_url} />
                  </video>
                )
              ) : (
                <img src={moment.media_url} alt={moment.caption || 'Moment'} />
              )}
              <span className="sr-only">Moment {index + 1}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default TimelinePlayer;
