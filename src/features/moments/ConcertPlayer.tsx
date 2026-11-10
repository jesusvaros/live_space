import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReportMomentButton } from '../community';
import { ExternalMomentCard } from '../socialImport';
import ConcertTracks, { type ConcertTracksHandle } from './ConcertTracks';
import {
  clipsAt,
  manualStillApplies,
  rankClips,
  resolvePlayhead,
  songSegmentAt,
  upcomingClip,
  type Clip,
  type ConcertTimeline,
  type ManualChoice,
} from './concertTimeline';

// The concert as one long video: a vertical player that follows concert time
// from clip to clip, over the multi-track timeline (one row per person).
//
// Playback rules live in concertTimeline.ts; this component only drives the
// clock. While a video plays, the video is the clock (buffering pauses the
// concert); photos and imported clips advance it in real time.
//
// Never more than two <video> elements: the one on screen and the next one,
// preloading.

const ZOOMS = [0.5, 1.5, 4]; // px per second of concert
const DEFAULT_ZOOM = 1;

export type SeekRequest = { clipId: string; nonce: number } | null;

type ConcertPlayerProps = {
  timeline: ConcertTimeline;
  title: string;
  stageChip?: React.ReactNode;
  // A song tapped in the setlist: play this clip.
  seekRequest?: SeekRequest;
  onActiveSongChange?: (songId: string | null) => void;
  onDuration?: (momentId: string, seconds: number) => void;
};

const clock = (t: number, seconds = true) =>
  new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) });

const SpeakerIcon: React.FC<{ muted: boolean }> = ({ muted }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" />
    {muted ? (
      <>
        <path d="m22 9-6 6" />
        <path d="m16 9 6 6" />
      </>
    ) : (
      <>
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 5.5a9 9 0 0 1 0 13" />
      </>
    )}
  </svg>
);

const PlayPauseIcon: React.FC<{ playing: boolean; size?: number }> = ({ playing, size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {playing ? (
      <>
        <rect x="6" y="5" width="4" height="14" rx="1" />
        <rect x="14" y="5" width="4" height="14" rx="1" />
      </>
    ) : (
      <path d="M8 5.5v13l10.5-6.5z" />
    )}
  </svg>
);

const ConcertPlayer: React.FC<ConcertPlayerProps> = ({ timeline, title, stageChip, seekRequest, onActiveSongChange, onDuration }) => {
  const tracksRef = useRef<ConcertTracksHandle | null>(null);
  const videosRef = useRef(new Map<string, HTMLVideoElement>());
  const timelineRef = useRef(timeline);
  const tRef = useRef(timeline.start);
  const activeRef = useRef<Clip | null>(null);
  const manualRef = useRef<ManualChoice>(null);
  const playingRef = useRef(true);
  const mutedRef = useRef(true);
  const scrubbingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const lastFrameRef = useRef<number | null>(null);
  const lastDisplayRef = useRef(0);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [manual, setManual] = useState<ManualChoice>(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [ended, setEnded] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [following, setFollowing] = useState(true);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [displayTime, setDisplayTime] = useState(timeline.start);

  const active = useMemo(() => timeline.clips.find(clip => clip.id === activeId) ?? null, [timeline.clips, activeId]);
  const covering = useMemo(() => clipsAt(timeline, displayTime), [timeline, displayTime]);
  const coveringIds = useMemo(() => new Set(covering.map(clip => clip.id)), [covering]);
  const upcoming = useMemo(
    () => upcomingClip(timeline, tRef.current, manual),
    // Recomputed when the angle changes, not every frame.
    [timeline, activeId, manual],
  );
  const segment = songSegmentAt(timeline.segments, displayTime);

  const setManualChoice = (next: ManualChoice) => {
    manualRef.current = next;
    setManual(next);
  };

  const syncVideo = useCallback((clip: Clip | null) => {
    for (const [id, video] of videosRef.current) {
      if (!clip || id !== clip.id) {
        if (!video.paused) video.pause();
      }
    }
    if (!clip || clip.kind !== 'video') return;
    const video = videosRef.current.get(clip.id);
    if (!video) return;
    video.muted = mutedRef.current;
    const offset = Math.max(0, (tRef.current - clip.start) / 1000);
    if (Math.abs(video.currentTime - offset) > 0.35) {
      try {
        video.currentTime = offset;
      } catch {
        // Not seekable yet: loadedmetadata seeks it.
      }
    }
    if (playingRef.current && !scrubbingRef.current) {
      video.play().catch(() => {
        // Autoplay refused (power saving, no gesture yet): wait for a tap.
        playingRef.current = false;
        setPlaying(false);
      });
    } else if (!video.paused) {
      video.pause();
    }
  }, []);

  const activate = useCallback((clip: Clip | null) => {
    if (activeRef.current?.id === clip?.id) return;
    activeRef.current = clip;
    setActiveId(clip?.id ?? null);
    setBuffering(false);
    // The new <video> may still need to mount; the effect below syncs it then.
    syncVideo(clip);
  }, [syncVideo]);

  const publishTime = useCallback((t: number, force = false) => {
    tracksRef.current?.setPlayhead(t);
    const now = performance.now();
    if (force || now - lastDisplayRef.current > 200) {
      lastDisplayRef.current = now;
      setDisplayTime(t);
    }
  }, []);

  /** Moves playback to `t` (jumping over a gap), optionally on a chosen clip. */
  const goTo = useCallback((t: number, chosen: ManualChoice = manualRef.current) => {
    const tl = timelineRef.current;
    const keep = chosen && manualStillApplies(tl, t, chosen) ? chosen : null;
    if (keep !== manualRef.current) setManualChoice(keep);
    const resolved = resolvePlayhead(tl, t, keep);
    if (resolved.ended && !resolved.clip) {
      tRef.current = Math.min(t, tl.end);
      setEnded(true);
      playingRef.current = false;
      setPlaying(false);
      publishTime(tRef.current, true);
      syncVideo(null);
      return;
    }
    setEnded(false);
    tRef.current = resolved.t;
    if (activeRef.current?.id === resolved.clip?.id) syncVideo(resolved.clip);
    else activate(resolved.clip);
    publishTime(resolved.t, true);
  }, [activate, publishTime, syncVideo]);

  // New data (e.g. a measured duration): keep the same clip and time.
  useEffect(() => {
    timelineRef.current = timeline;
    const sameClip = activeRef.current ? timeline.clips.find(clip => clip.id === activeRef.current?.id) ?? null : null;
    if (activeRef.current && sameClip) activeRef.current = sameClip;
    else goTo(activeRef.current ? tRef.current : timeline.start);
  }, [timeline, goTo]);

  // The clock.
  useEffect(() => {
    let frame = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const last = lastFrameRef.current;
      lastFrameRef.current = now;
      if (!playingRef.current || scrubbingRef.current || last === null) return;
      const tl = timelineRef.current;
      const clip = activeRef.current;
      let t = tRef.current;
      if (clip?.kind === 'video') {
        const video = videosRef.current.get(clip.id);
        if (!video) return;
        if (video.ended) t = Math.max(t, clip.end);
        else if (!video.paused && video.readyState >= 2) t = clip.start + video.currentTime * 1000;
        else return; // buffering: the concert waits for the video
      } else {
        t += Math.min(now - last, 250);
      }
      let chosen = manualRef.current;
      if (chosen && !manualStillApplies(tl, t, chosen)) {
        chosen = null;
        setManualChoice(null);
      }
      const resolved = resolvePlayhead(tl, t, chosen);
      if (resolved.ended && !resolved.clip) {
        tRef.current = tl.end;
        playingRef.current = false;
        setPlaying(false);
        setEnded(true);
        publishTime(tl.end, true);
        return;
      }
      tRef.current = resolved.t;
      if (resolved.clip?.id !== clip?.id) activate(resolved.clip);
      publishTime(resolved.t);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [activate, publishTime]);

  // A newly mounted <video> for the clip on screen gets its time and plays.
  useEffect(() => {
    syncVideo(active);
  }, [active, syncVideo]);

  useEffect(() => {
    onActiveSongChange?.(segment?.songId ?? active?.moment.songId ?? null);
  }, [segment?.songId, active?.moment.songId, onActiveSongChange]);

  // A song tapped in the setlist.
  useEffect(() => {
    if (!seekRequest) return;
    const clip = timelineRef.current.clips.find(item => item.id === seekRequest.clipId);
    if (!clip) return;
    setFollowing(true);
    playingRef.current = true;
    setPlaying(true);
    goTo(clip.start, { clipId: clip.id });
    tracksRef.current?.recenter();
  }, [seekRequest, goTo]);

  const play = () => {
    if (ended) {
      setEnded(false);
      tRef.current = timeline.start;
      setManualChoice(null);
    }
    playingRef.current = true;
    setPlaying(true);
    setFollowing(true);
    tracksRef.current?.recenter();
    goTo(tRef.current);
  };

  const pause = () => {
    playingRef.current = false;
    setPlaying(false);
    syncVideo(activeRef.current);
  };

  const togglePlay = () => (playingRef.current ? pause() : play());

  const toggleMute = () => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    for (const video of videosRef.current.values()) video.muted = next;
    // Unmuting is a gesture: a refused autoplay can start now.
    if (!next && !playingRef.current && !ended) play();
  };

  const pickClip = useCallback((clip: Clip) => {
    const t = tRef.current;
    const at = clip.start <= t && t < clip.end ? t : clip.start;
    playingRef.current = true;
    setPlaying(true);
    goTo(at, { clipId: clip.id });
  }, [goTo]);

  const cycleAngle = () => {
    if (covering.length < 2 || !active) return;
    const ranked = rankClips(covering, tRef.current);
    const index = ranked.findIndex(clip => clip.id === active.id);
    pickClip(ranked[(index + 1) % ranked.length]);
  };

  const onSeek = useCallback((t: number, options?: { scrubbing?: boolean }) => {
    if (options?.scrubbing) {
      if (!scrubbingRef.current) {
        wasPlayingRef.current = playingRef.current;
        scrubbingRef.current = true;
      }
      // While dragging, show the frame at the finger without the gap jump.
      const tl = timelineRef.current;
      tRef.current = t;
      const resolved = resolvePlayhead(tl, t, null);
      activate(resolved.clip);
      syncVideo(resolved.clip);
      publishTime(t, true);
      return;
    }
    setManualChoice(null);
    goTo(t, null);
  }, [activate, goTo, publishTime, syncVideo]);

  const onScrubEnd = useCallback(() => {
    if (!scrubbingRef.current) return;
    scrubbingRef.current = false;
    playingRef.current = wasPlayingRef.current || playingRef.current;
    setPlaying(playingRef.current);
    goTo(tRef.current, null);
  }, [goTo]);

  const backToNow = () => {
    setFollowing(true);
    tracksRef.current?.recenter();
    if (!playingRef.current && !ended) play();
  };

  const registerVideo = (clipId: string) => (node: HTMLVideoElement | null) => {
    if (node) videosRef.current.set(clipId, node);
    else videosRef.current.delete(clipId);
  };

  const videoClips = [active, upcoming].filter((clip, index, list): clip is Clip =>
    Boolean(clip && clip.kind === 'video' && list.findIndex(other => other?.id === clip.id) === index));

  const moment = active?.moment ?? null;
  const landscape = Boolean(moment?.width && moment?.height && moment.width > moment.height);
  const backdrop = moment?.thumbnailUrl || (moment?.mediaType === 'image' ? moment.mediaUrl : null);
  const handle = active ? timeline.tracks.find(track => track.id === active.trackId)?.label ?? '' : '';
  const angleCount = covering.length;

  return (
    <section className="flex flex-col" aria-label="Reproductor del concierto">
      {/* Stage */}
      <div className="relative h-[min(50svh,560px)] min-h-[340px] overflow-hidden bg-black">
        {backdrop ? (
          <img src={backdrop} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl" />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,91,46,0.28),transparent_65%)]" />
        )}

        <div
          className="relative mx-auto h-full max-w-full overflow-hidden bg-black sm:rounded-none"
          style={{ aspectRatio: '9 / 16' }}
          onClick={event => {
            if (event.target === event.currentTarget || (event.target as HTMLElement).tagName === 'VIDEO' || (event.target as HTMLElement).tagName === 'IMG') togglePlay();
          }}
        >
          {videoClips.map(clip => (
            <video
              key={clip.id}
              ref={registerVideo(clip.id)}
              src={clip.moment.mediaUrl}
              poster={clip.moment.thumbnailUrl || undefined}
              muted={muted}
              playsInline
              preload={clip.id === active?.id ? 'auto' : 'auto'}
              aria-hidden={clip.id !== active?.id}
              className={`absolute inset-0 h-full w-full ${
                clip.moment.width && clip.moment.height && clip.moment.width > clip.moment.height ? 'object-contain' : 'object-cover'
              } ${clip.id === active?.id ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
              onLoadedMetadata={event => {
                const video = event.currentTarget;
                if (Number.isFinite(video.duration) && !clip.moment.durationSec) onDuration?.(clip.id, video.duration);
                if (clip.id === activeRef.current?.id) syncVideo(activeRef.current);
              }}
              onWaiting={() => clip.id === activeRef.current?.id && setBuffering(true)}
              onPlaying={() => clip.id === activeRef.current?.id && setBuffering(false)}
              onError={() => {
                // Broken file: skip to what comes after it.
                if (clip.id === activeRef.current?.id) goTo(clip.end, null);
              }}
            />
          ))}

          {active?.kind === 'photo' && moment ? (
            <img
              key={active.id}
              src={moment.mediaUrl}
              alt={`Foto de ${handle}`}
              className={`absolute inset-0 h-full w-full ${landscape ? 'object-contain' : 'object-cover'}`}
            />
          ) : null}

          {active?.kind === 'external' && moment?.post ? (
            // Playing the original pauses the concert clock: it is not ours to time.
            <div key={active.id} className="absolute inset-0" onClickCapture={() => pause()}>
              <ExternalMomentCard post={moment.post} variant="media" />
            </div>
          ) : null}

          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.78)_0%,rgba(0,0,0,0)_38%,rgba(0,0,0,0)_78%,rgba(0,0,0,0.45))]" />

          {buffering && playing ? (
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 animate-spin rounded-full border-2 border-white/25 border-t-white motion-reduce:animate-none" />
          ) : null}

          {!playing && active?.kind !== 'external' ? (
            <button
              type="button"
              aria-label={ended ? 'Volver a ver desde el principio' : 'Reproducir'}
              onClick={play}
              className="absolute left-1/2 top-1/2 flex h-16 min-w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-2 rounded-full bg-app-ink/90 px-5 text-app-bg shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
            >
              <PlayPauseIcon playing={false} size={26} />
              {ended ? <span className="text-sm font-bold">Volver a ver</span> : null}
            </button>
          ) : null}

          {/* Caption */}
          <div className="pointer-events-none absolute inset-x-3 bottom-3 pr-14">
            {segment ? (
              <p className="truncate font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-app-accent">
                Suena · {String(segment.ordinal).padStart(2, '0')} {segment.title}
                {segment.estimated ? ' ~' : ''}
              </p>
            ) : null}
            <p className="mt-0.5 truncate font-display text-[19px] font-bold leading-tight text-white">
              {moment ? handle : title}
              {moment ? <span className="font-mono text-[14px] font-semibold text-white/75"> · {clock(active!.start, false)}</span> : null}
            </p>
            {active?.placement === 'song' ? (
              <p className="mt-0.5 text-[11px] text-white/60">Sin hora exacta: colocado en su canción</p>
            ) : null}
          </div>

          {/* Right column */}
          <div className="absolute bottom-3 right-2 flex flex-col items-center gap-2">
            {active && active.kind !== 'external' ? (
              <ReportMomentButton postId={active.id} authorId={active.moment.userId} variant="round" />
            ) : null}
            {angleCount > 1 ? (
              <button
                type="button"
                onClick={cycleAngle}
                aria-label={`Cambiar de ángulo (${angleCount} personas grabaron este momento)`}
                className="flex h-12 w-12 flex-col items-center justify-center rounded-full bg-black/45 text-white backdrop-blur"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 7h13l-3-3M21 17H8l3 3" />
                </svg>
                <span className="font-mono text-[10px] font-bold leading-none">{angleCount}</span>
              </button>
            ) : null}
          </div>
        </div>

        {stageChip ? (
          <div className="pointer-events-none absolute right-3 top-[calc(14px+env(safe-area-inset-top,0px))] z-[1301] max-w-[64%]">
            {stageChip}
          </div>
        ) : null}

        {/* Sound: muted autoplay needs an obvious way to turn it on. */}
        <button
          type="button"
          onClick={toggleMute}
          aria-pressed={!muted}
          aria-label={muted ? 'Activar sonido' : 'Silenciar'}
          className={`absolute left-3 top-[calc(64px+env(safe-area-inset-top,0px))] z-10 flex h-11 items-center gap-2 rounded-full backdrop-blur-md ${
            muted ? 'bg-white px-3.5 text-[#14151a] shadow-[0_6px_20px_rgba(0,0,0,0.35)]' : 'w-11 justify-center bg-black/45 text-white'
          }`}
        >
          <SpeakerIcon muted={muted} />
          {muted ? <span className="text-[13px] font-bold">Activar sonido</span> : null}
        </button>
      </div>

      {/* Transport */}
      <div className="flex items-center gap-2 px-4 pb-2.5 pt-3">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? 'Pausar' : 'Reproducir'}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-accent text-[#14151a]"
        >
          <PlayPauseIcon playing={playing} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[15px] font-bold tabular-nums text-app-ink" aria-live="off">{clock(displayTime)}</p>
          <p className="truncate text-[11px] text-white/50">
            {timeline.clips.length} momentos · {timeline.tracks.length} {timeline.tracks.length === 1 ? 'persona' : 'personas'}
            {angleCount > 1 ? ` · ${angleCount} ángulos ahora` : ''}
          </p>
        </div>
        {!following ? (
          <button
            type="button"
            onClick={backToNow}
            className="h-11 shrink-0 rounded-full border border-app-accent/60 bg-app-accent/10 px-3.5 text-[13px] font-bold text-app-accent"
          >
            Volver al ahora
          </button>
        ) : null}
        <div className="flex shrink-0 overflow-hidden rounded-full border border-app-line">
          <button
            type="button"
            aria-label="Alejar la línea de tiempo"
            disabled={zoom === 0}
            onClick={() => setZoom(value => Math.max(0, value - 1))}
            className="flex h-11 w-11 items-center justify-center text-lg font-bold text-app-ink disabled:text-white/25"
          >
            −
          </button>
          <button
            type="button"
            aria-label="Acercar la línea de tiempo"
            disabled={zoom === ZOOMS.length - 1}
            onClick={() => setZoom(value => Math.min(ZOOMS.length - 1, value + 1))}
            className="flex h-11 w-11 items-center justify-center border-l border-app-line text-lg font-bold text-app-ink disabled:text-white/25"
          >
            +
          </button>
        </div>
      </div>

      <div className="px-4">
        <ConcertTracks
          ref={tracksRef}
          timeline={timeline}
          initialTime={tRef.current}
          activeClipId={activeId}
          coveringIds={coveringIds}
          pxPerSec={ZOOMS[zoom]}
          following={following}
          onUserScroll={() => setFollowing(false)}
          onSeek={onSeek}
          onScrubEnd={onScrubEnd}
          onPickClip={pickClip}
        />
        <p className="mt-2 text-[11px] leading-snug text-white/40">
          Toca una pista para cambiar de ángulo. Arrastra la regla para moverte por el concierto.
          {timeline.segments.some(item => item.estimated) ? ' ~ hora de canción estimada.' : ''}
        </p>
      </div>
    </section>
  );
};

export default ConcertPlayer;
