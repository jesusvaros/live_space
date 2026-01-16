import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type TimelineBucket = {
  bucket_time: string;
  moment_count: number;
};

type TimelineScrubberProps = {
  buckets: TimelineBucket[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  eventStart: Date | null;
  gapThresholdSeconds?: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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

const TimelineScrubber: React.FC<TimelineScrubberProps> = ({
  buckets,
  selectedIndex,
  onSelectIndex,
  eventStart,
  gapThresholdSeconds = 120,
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const metricsRef = useRef<{ offsets: number[]; maxOffset: number }>({
    offsets: [],
    maxOffset: 1,
  });
  const [dragging, setDragging] = useState(false);

  const startTime = useMemo(() => {
    if (eventStart) return eventStart;
    if (buckets[0]) return new Date(buckets[0].bucket_time);
    return null;
  }, [eventStart, buckets]);

  const offsets = useMemo(() => {
    if (!startTime) return [];
    return buckets.map(bucket => {
      const diff = Math.round((new Date(bucket.bucket_time).getTime() - startTime.getTime()) / 1000);
      return diff < 0 ? 0 : diff;
    });
  }, [buckets, startTime]);

  const maxOffset = useMemo(() => {
    if (offsets.length === 0) return 1;
    return Math.max(...offsets, 1);
  }, [offsets]);

  const segments = useMemo(() => {
    if (offsets.length < 2 || maxOffset <= 0) return [];
    const list = [];
    for (let i = 0; i < offsets.length - 1; i += 1) {
      const start = offsets[i];
      const end = offsets[i + 1];
      if (end <= start) continue;
      const isGap = end - start > gapThresholdSeconds;
      list.push({
        key: `${start}-${end}`,
        left: (start / maxOffset) * 100,
        width: ((end - start) / maxOffset) * 100,
        isGap,
      });
    }
    return list;
  }, [offsets, maxOffset, gapThresholdSeconds]);

  useEffect(() => {
    metricsRef.current = { offsets, maxOffset };
  }, [offsets, maxOffset]);

  const selectByClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || buckets.length === 0) return;
      const rect = track.getBoundingClientRect();
      if (rect.width === 0) return;
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      const { offsets: currentOffsets, maxOffset: currentMax } = metricsRef.current;
      const target = ratio * currentMax;

      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      currentOffsets.forEach((offset, index) => {
        const distance = Math.abs(offset - target);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      onSelectIndex(nearestIndex);
    },
    [buckets.length, onSelectIndex]
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    trackRef.current.setPointerCapture(event.pointerId);
    setDragging(true);
    selectByClientX(event.clientX);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    selectByClientX(event.clientX);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    if (trackRef.current.hasPointerCapture(event.pointerId)) {
      trackRef.current.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  };

  if (buckets.length === 0) {
    return null;
  }

  const selectedOffset = offsets[selectedIndex] ?? 0;
  const selectedRatio = maxOffset ? selectedOffset / maxOffset : 0;

  return (
    <div className="timeline-scrubber">
      <div
        className="scrubber-track"
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div className="scrubber-line" />
        {segments.map(segment => (
          <div
            key={segment.key}
            className={`scrubber-segment ${segment.isGap ? 'is-gap' : ''}`}
            style={{ left: `${segment.left}%`, width: `${segment.width}%` }}
          />
        ))}
        {buckets.map((bucket, index) => {
          const ratio = maxOffset ? (offsets[index] ?? 0) / maxOffset : 0;
          const strength = bucket.moment_count >= 5 ? 3 : bucket.moment_count >= 3 ? 2 : 1;
          return (
            <button
              key={bucket.bucket_time}
              type="button"
              className={`scrubber-marker ${index === selectedIndex ? 'is-active' : ''}`}
              data-strength={strength}
              style={{ left: `${ratio * 100}%` }}
              onClick={() => onSelectIndex(index)}
            >
              <span className="sr-only">{formatRelative(offsets[index] ?? 0)}</span>
            </button>
          );
        })}
        <div className="scrubber-thumb" style={{ left: `${selectedRatio * 100}%` }} />
      </div>
      <div className="scrubber-labels">
        <span>{formatRelative(0)}</span>
        <span>{formatRelative(maxOffset)}</span>
      </div>
    </div>
  );
};

export default TimelineScrubber;
