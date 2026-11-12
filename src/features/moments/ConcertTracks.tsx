import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { Clip, ConcertTimeline, Track } from './concertTimeline';

// Ruler (songs + clock) and one row per person, like a video editor. Only
// lightweight blocks: no <video> here. Rows and blocks outside the visible
// window are not rendered, so a concert with hundreds of moments stays cheap.

export const LABEL_W = 92;
const ROW_H = 44;
const RULER_H = 52;
const VISIBLE_ROWS = 5;
// Over the full-screen stage: fewer rows, so the video keeps the screen.
const OVERLAY_VISIBLE_ROWS = 3;
const PAD_MS = 8000;
const MIN_BLOCK_PX = 14;
const WINDOW_BUFFER_PX = 480;
const MAX_BLOCKS = 300;
// Where the playhead sits while following, as a share of the visible width.
const FOLLOW_AT = 0.32;
const TICK_STEPS_SEC = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

export type ConcertTracksHandle = {
  // Moves the playhead (and the view, while following) without a re-render.
  setPlayhead: (t: number) => void;
  // Brings the playhead back into view (smooth unless reduced motion).
  recenter: () => void;
};

type ConcertTracksProps = {
  timeline: ConcertTimeline;
  initialTime: number;
  activeClipId: string | null;
  // Clips covering the playhead (the other angles available right now).
  coveringIds: Set<string>;
  pxPerSec: number;
  following: boolean;
  onUserScroll: () => void;
  onSeek: (t: number, options?: { scrubbing?: boolean }) => void;
  onScrubEnd: () => void;
  onPickClip: (clip: Clip) => void;
  // Laid over the video (translucent panels) instead of a solid card.
  overlay?: boolean;
};

const clock = (t: number, seconds = false) =>
  new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) });

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

const kindLabel = (clip: Clip) => (clip.kind === 'photo' ? 'foto' : clip.kind === 'external' ? 'clip importado' : 'vídeo');

type BlockProps = {
  clip: Clip;
  left: number;
  width: number;
  top: number;
  height: number;
  label: string;
  active: boolean;
  covering: boolean;
  onPick: (clip: Clip) => void;
};

const ClipBlock = memo(({ clip, left, width, top, height, label, active, covering, onPick }: BlockProps) => {
  const thumb = clip.moment.thumbnailUrl || (clip.kind === 'photo' ? clip.moment.mediaUrl : null);
  const tone = clip.kind === 'photo'
    ? 'bg-[#e8e2d6]'
    : clip.kind === 'external'
      ? 'bg-[#8b5cf6]'
      : 'bg-app-accent';
  return (
    <button
      type="button"
      data-clip-id={clip.id}
      aria-label={`${label}, ${kindLabel(clip)} de las ${clock(clip.start)}${active ? ', en pantalla' : covering ? ', otro ángulo disponible' : ''}`}
      aria-pressed={active}
      onClick={event => {
        event.stopPropagation();
        onPick(clip);
      }}
      className="absolute flex items-center"
      style={{ left, width, top, height }}
    >
      <span
        className={`relative block h-[calc(100%-8px)] w-full overflow-hidden rounded-[6px] ${tone} ${
          active
            ? 'opacity-100 ring-2 ring-white shadow-[0_0_0_4px_rgba(255,91,46,0.35)]'
            : covering
              ? 'opacity-90 ring-1 ring-white/60'
              : 'opacity-55'
        } ${clip.placement === 'song' ? 'outline-dashed outline-1 outline-offset-[-3px] outline-black/50' : ''}`}
      >
        {thumb && (clip.kind === 'photo' || width >= 28) ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            decoding="async"
            className={`absolute inset-y-0 left-0 h-full object-cover ${clip.kind === 'photo' ? 'w-full' : 'w-7'}`}
          />
        ) : null}
        {clip.kind === 'video' && width >= 24 ? (
          <span className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0_9px,rgba(0,0,0,0.14)_9px_10px)]" />
        ) : null}
      </span>
    </button>
  );
});
ClipBlock.displayName = 'ClipBlock';

const ConcertTracks = forwardRef<ConcertTracksHandle, ConcertTracksProps>(
  ({ timeline, initialTime, activeClipId, coveringIds, pxPerSec, following, onUserScroll, onSeek, onScrubEnd, onPickClip, overlay = false }, ref) => {
    // Panel colour: solid on the page, see-through over the stage.
    const panel = overlay ? 'bg-black/55' : 'bg-[#111317]';
    const scrollerRef = useRef<HTMLDivElement | null>(null);
    const playheadRef = useRef<HTMLDivElement | null>(null);
    const timeRef = useRef(initialTime);
    const followingRef = useRef(following);
    const programmaticLeftRef = useRef<number | null>(null);
    const lastInputRef = useRef(0);
    const pausedFollowUntilRef = useRef(0);
    const [view, setView] = useState({ left: 0, top: 0, width: 360, height: 300 });

    const viewStart = timeline.start - PAD_MS;
    // At least as wide as the visible area, so a short concert still gets a
    // full ruler instead of an empty strip.
    const viewEnd = Math.max(timeline.end + PAD_MS, viewStart + ((view.width - LABEL_W) / pxPerSec) * 1000);
    const contentWidth = Math.max(1, ((viewEnd - viewStart) / 1000) * pxPerSec);
    const xOf = useCallback((t: number) => ((t - viewStart) / 1000) * pxPerSec, [viewStart, pxPerSec]);
    const tOf = useCallback((x: number) => viewStart + (x / pxPerSec) * 1000, [viewStart, pxPerSec]);

    const rows = useMemo(() => {
      let y = 0;
      return timeline.tracks.map(track => {
        // Two visual lanes at most; a third overlapping clip shares the last.
        const lanes = Math.min(track.lanes, 2);
        const row = { track, top: y, height: ROW_H + (lanes - 1) * 20, lanes };
        y += row.height;
        return row;
      });
    }, [timeline.tracks]);
    const contentHeight = rows.length ? rows[rows.length - 1].top + rows[rows.length - 1].height : ROW_H;

    const followTarget = useCallback(
      (t: number) => {
        const scroller = scrollerRef.current;
        if (!scroller) return 0;
        const visible = scroller.clientWidth - LABEL_W;
        return Math.max(0, xOf(t) - visible * FOLLOW_AT);
      },
      [xOf],
    );

    const scrollToX = useCallback((left: number, smooth: boolean) => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const max = scroller.scrollWidth - scroller.clientWidth;
      const clamped = Math.max(0, Math.min(max, left));
      programmaticLeftRef.current = clamped;
      if (smooth && !prefersReducedMotion()) {
        pausedFollowUntilRef.current = performance.now() + 450;
        scroller.scrollTo({ left: clamped, behavior: 'smooth' });
      } else {
        scroller.scrollLeft = clamped;
      }
    }, []);

    const placePlayhead = useCallback(
      (t: number) => {
        timeRef.current = t;
        const node = playheadRef.current;
        if (node) node.style.transform = `translateX(${LABEL_W + xOf(t)}px)`;
        if (followingRef.current && performance.now() > pausedFollowUntilRef.current) {
          const target = followTarget(t);
          const scroller = scrollerRef.current;
          if (scroller && Math.abs(scroller.scrollLeft - target) > 0.5) scrollToX(target, false);
        }
      },
      [xOf, followTarget, scrollToX],
    );

    useImperativeHandle(
      ref,
      () => ({
        setPlayhead: placePlayhead,
        recenter: () => scrollToX(followTarget(timeRef.current), true),
      }),
      [placePlayhead, scrollToX, followTarget],
    );

    useEffect(() => {
      followingRef.current = following;
    }, [following]);

    // Zoom or new data: keep the playhead where it was in time.
    useEffect(() => {
      placePlayhead(timeRef.current);
      if (followingRef.current) scrollToX(followTarget(timeRef.current), false);
    }, [pxPerSec, timeline, placePlayhead, scrollToX, followTarget]);

    // The playing person's row comes into view when the angle changes.
    useEffect(() => {
      if (!followingRef.current || !activeClipId) return;
      const scroller = scrollerRef.current;
      const clip = timeline.clips.find(item => item.id === activeClipId);
      const row = clip ? rows.find(item => item.track.id === clip.trackId) : undefined;
      if (!scroller || !row) return;
      const visibleTop = scroller.scrollTop;
      const visibleBottom = visibleTop + scroller.clientHeight - RULER_H;
      if (row.top < visibleTop || row.top + row.height > visibleBottom) {
        scroller.scrollTo({ top: Math.max(0, row.top - ROW_H), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      }
    }, [activeClipId, rows, timeline.clips]);

    const markInput = () => {
      lastInputRef.current = performance.now();
    };

    const onScroll = () => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const { scrollLeft, scrollTop, clientWidth, clientHeight } = scroller;
      setView(previous =>
        Math.abs(previous.left - scrollLeft) < 120 && Math.abs(previous.top - scrollTop) < 22
          && previous.width === clientWidth && previous.height === clientHeight
          ? previous
          : { left: scrollLeft, top: scrollTop, width: clientWidth, height: clientHeight });
      // A horizontal scroll right after a touch, wheel or drag is the viewer's:
      // stop following the playhead until they ask to go back to it.
      const byUs = programmaticLeftRef.current !== null && Math.abs(programmaticLeftRef.current - scrollLeft) < 2;
      const recentInput = performance.now() - lastInputRef.current < 900;
      if (!byUs && recentInput && followingRef.current) onUserScroll();
    };

    useEffect(() => {
      onScroll();
      const scroller = scrollerRef.current;
      if (!scroller || typeof ResizeObserver === 'undefined') return undefined;
      const observer = new ResizeObserver(() => onScroll());
      observer.observe(scroller);
      return () => observer.disconnect();
    }, []);

    // Visible window, in content x (after the label column) and y.
    const windowFrom = view.left - WINDOW_BUFFER_PX;
    const windowTo = view.left + view.width + WINDOW_BUFFER_PX;
    const rowsFrom = view.top - ROW_H * 3;
    const rowsTo = view.top + view.height + ROW_H * 3;

    const visibleRows = rows.filter(row => row.top + row.height >= rowsFrom && row.top <= rowsTo);

    const blocks: React.ReactNode[] = [];
    for (const row of visibleRows) {
      const laneHeight = row.lanes > 1 ? row.height / row.lanes : row.height;
      for (const clip of row.track.clips) {
        if (blocks.length >= MAX_BLOCKS) break;
        const left = xOf(clip.start);
        const width = Math.max(MIN_BLOCK_PX, ((clip.end - clip.start) / 1000) * pxPerSec - 2);
        if (left + width < windowFrom || left > windowTo) continue;
        const lane = Math.min(clip.lane, row.lanes - 1);
        blocks.push(
          <ClipBlock
            key={clip.id}
            clip={clip}
            left={LABEL_W + left}
            width={width}
            top={RULER_H + row.top + lane * laneHeight}
            height={laneHeight}
            label={row.track.label}
            active={clip.id === activeClipId}
            covering={coveringIds.has(clip.id)}
            onPick={onPickClip}
          />,
        );
      }
    }

    // Ruler: song segments and clock ticks in the visible window.
    const segments = timeline.segments
      .map(segment => ({ segment, left: xOf(Math.max(segment.start, viewStart)), right: xOf(Math.min(segment.end, viewEnd)) }))
      .filter(item => item.right > item.left && item.right >= windowFrom && item.left <= windowTo);

    const stepSec = TICK_STEPS_SEC.find(step => step * pxPerSec >= 76) ?? 3600;
    const ticks: number[] = [];
    const firstTick = Math.ceil(viewStart / (stepSec * 1000)) * stepSec * 1000;
    for (let t = firstTick; t <= viewEnd && ticks.length < 400; t += stepSec * 1000) {
      const x = xOf(t);
      if (x >= windowFrom && x <= windowTo) ticks.push(t);
    }

    // Scrubbing on the ruler: tap to seek, drag to scrub.
    const scrubbingRef = useRef(false);
    const seekFromPointer = (event: React.PointerEvent, scrubbing: boolean) => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const rect = scroller.getBoundingClientRect();
      const x = event.clientX - rect.left + scroller.scrollLeft - LABEL_W;
      onSeek(Math.max(timeline.start, Math.min(timeline.end, tOf(x))), { scrubbing });
    };

    const activeTrackId = activeClipId ? timeline.clips.find(clip => clip.id === activeClipId)?.trackId : null;

    return (
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        onTouchStart={markInput}
        onTouchMove={markInput}
        onWheel={markInput}
        onPointerDown={markInput}
        className={`relative overflow-auto overscroll-contain rounded-2xl border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          overlay ? 'border-white/10 bg-black/35 backdrop-blur-[2px]' : 'border-app-line bg-[#111317]'
        }`}
        style={{ maxHeight: RULER_H + ROW_H * (overlay ? OVERLAY_VISIBLE_ROWS : VISIBLE_ROWS) + 4 }}
        aria-label="Pistas del concierto"
        role="region"
      >
        <div className="relative" style={{ width: LABEL_W + contentWidth, height: RULER_H + contentHeight }}>
          {/* Ruler */}
          <div
            className={`sticky top-0 z-20 cursor-ew-resize touch-none select-none border-b border-app-line ${panel}`}
            style={{ height: RULER_H, width: LABEL_W + contentWidth }}
            role="slider"
            aria-label="Línea de tiempo del concierto. Toca o arrastra para moverte"
            aria-valuemin={timeline.start}
            aria-valuemax={timeline.end}
            aria-valuenow={Math.round(timeRef.current)}
            aria-valuetext={clock(timeRef.current, true)}
            tabIndex={0}
            onKeyDown={event => {
              const step = event.shiftKey ? 30_000 : 5_000;
              if (event.key === 'ArrowRight') onSeek(Math.min(timeline.end, timeRef.current + step));
              if (event.key === 'ArrowLeft') onSeek(Math.max(timeline.start, timeRef.current - step));
            }}
            onPointerDown={event => {
              scrubbingRef.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              seekFromPointer(event, true);
            }}
            onPointerMove={event => {
              if (scrubbingRef.current) seekFromPointer(event, true);
            }}
            onPointerUp={event => {
              if (!scrubbingRef.current) return;
              scrubbingRef.current = false;
              seekFromPointer(event, false);
              onScrubEnd();
            }}
            onPointerCancel={() => {
              scrubbingRef.current = false;
              onScrubEnd();
            }}
          >
            {segments.map(({ segment, left, right }) => (
              <div
                key={`${segment.ordinal}-${segment.start}`}
                className="absolute top-0 flex h-[30px] items-center overflow-hidden border-l border-white/15 px-1.5"
                style={{ left: LABEL_W + left, width: right - left }}
                title={segment.estimated ? 'Hora de la canción estimada' : undefined}
              >
                <span className="truncate font-mono text-[11px] font-semibold text-[#d9d4ca]">
                  <span className="text-app-accent">{String(segment.ordinal).padStart(2, '0')}</span> {segment.title}
                  {segment.estimated ? <span className="text-white/35"> ~</span> : null}
                </span>
              </div>
            ))}
            {ticks.map(t => (
              <div key={t} className="absolute bottom-0 h-[22px] border-l border-white/20 pl-1" style={{ left: LABEL_W + xOf(t) }}>
                <span className="font-mono text-[10px] leading-[22px] text-white/45">{clock(t, stepSec < 60)}</span>
              </div>
            ))}
            <div className={`sticky left-0 z-10 flex h-full flex-col justify-center border-r border-app-line px-2.5 ${panel}`} style={{ width: LABEL_W }}>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45">Canción</span>
              <span className="mt-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">Hora</span>
            </div>
          </div>

          {/* Rows: tapping empty space seeks there. */}
          {visibleRows.map(row => (
            <TrackRow
              key={row.track.id}
              track={row.track}
              top={RULER_H + row.top}
              height={row.height}
              width={LABEL_W + contentWidth}
              active={row.track.id === activeTrackId}
              overlay={overlay}
              onSeekX={x => onSeek(Math.max(timeline.start, Math.min(timeline.end, tOf(x - LABEL_W))))}
            />
          ))}

          {blocks}

          {/* Playhead */}
          <div
            ref={playheadRef}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 z-10 w-0"
            style={{ height: RULER_H + contentHeight, transform: `translateX(${LABEL_W + xOf(timeRef.current)}px)` }}
          >
            <div className="absolute -left-px top-0 h-full w-[2px] bg-app-accent shadow-[0_0_10px_rgba(255,91,46,0.7)]" />
            <div className="absolute -left-[6px] top-[28px] h-3 w-3 rotate-45 rounded-[2px] bg-app-accent" />
          </div>
        </div>
      </div>
    );
  },
);
ConcertTracks.displayName = 'ConcertTracks';

type TrackRowProps = {
  track: Track;
  top: number;
  height: number;
  width: number;
  active: boolean;
  overlay?: boolean;
  onSeekX: (x: number) => void;
};

const TrackRow = memo(({ track, top, height, width, active, overlay, onSeekX }: TrackRowProps) => (
  <div
    className={`absolute left-0 border-b border-white/[0.06] ${active ? 'bg-app-accent/[0.06]' : ''}`}
    style={{ top, height, width }}
    onClick={event => {
      const rect = event.currentTarget.getBoundingClientRect();
      onSeekX(event.clientX - rect.left);
    }}
  >
    <div
      onClick={event => event.stopPropagation()}
      className={`sticky left-0 z-[15] flex h-full items-center gap-1.5 border-r border-app-line px-2 ${
        active ? (overlay ? 'bg-[#2a1a14]/85' : 'bg-[#2a1a14]') : overlay ? 'bg-black/70' : 'bg-[#111317]'
      }`}
      style={{ width: LABEL_W }}
    >
      {track.avatarUrl ? (
        <img src={track.avatarUrl} alt="" loading="lazy" className="h-6 w-6 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-app-surfaceStrong font-mono text-[10px] font-bold uppercase text-white/70">
          {track.label.replace('@', '').slice(0, 1)}
        </span>
      )}
      <span className={`min-w-0 truncate text-[12px] font-semibold ${active ? 'text-app-accent' : track.isMe ? 'text-app-ink' : 'text-[#c9c5bd]'}`}>
        {track.label}
      </span>
    </div>
  </div>
));
TrackRow.displayName = 'TrackRow';

export default ConcertTracks;
