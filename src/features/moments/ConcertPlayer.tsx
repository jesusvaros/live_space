import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconHeart, IconHeartFilled } from '../../components/icons';
import { videoPoster } from '../../media/videoPoster';
import { ReportMomentButton } from '../community';
import { likesShown } from '../photos/likeCount';
import { usePostLikes } from '../photos/usePostLikes';
import { ExternalMomentCard } from '../socialImport';
import ConcertTracks, { type ConcertTracksHandle } from './ConcertTracks';
import {
  clipOffsetSec,
  clipsAt,
  manualStillApplies,
  rankClips,
  resolvePlayhead,
  songSegmentAt,
  upcomingCut,
  VIEW_AFTER_MS,
  type Clip,
  type ConcertTimeline,
  type Hold,
  type ManualChoice,
  type TimelineMoment,
} from './concertTimeline';
import { recordPostView } from './postViews';
import {
  CROSSFADE_MS,
  frameReadyAt,
  HANDOFF_TIMEOUT_MS,
  handoffSource,
  SEEK_TOLERANCE_SEC,
  videoPreload,
  videoSlots,
  WARM_AFTER_MS,
} from './videoHandoff';

// The concert as one long video: a full-screen player that follows concert
// time from clip to clip, with the multi-track timeline (one row per person)
// laid over the bottom of the picture. It fills its parent (the concert
// page's stage, one screen tall) and only plays while `inView`.
//
// Playback rules live in concertTimeline.ts; this component only drives the
// clock. While a video plays, the video is the clock (buffering pauses the
// concert); photos and imported clips advance it in real time.
//
// The clip on screen is held at least MIN_HOLD_MS before the default rule
// cuts to a more popular angle (see pickClip). A clip that really played
// VIEW_AFTER_MS counts one view (post_views).
//
// Never more than two <video> elements: the one on screen and the next one,
// preloading and already seeked to where the cut will enter it. Cuts are
// seamless (videoHandoff.ts): the outgoing video stays on screen until the
// incoming one has shown a frame at the right time, then the new one fades in
// over it. During that handoff the outgoing one takes the second slot and the
// clip after next waits to preload.
//
// The next clip only fetches its metadata (and is seeked to its cut) until
// the one on screen has buffered enough to play — canplaythrough, or
// WARM_AFTER_MS of real playback — so on mobile data the two never compete
// for the first picture (videoPreload). Until the clip on screen shows its
// first frame the stage says so («Cargando el concierto…») over the same
// chrome, instead of a black screen.
//
// ♥ (post_likes, the same set as «Guardar» in the photos) for the clip on
// screen: the button on the right or a double tap on the picture. A single
// tap still plays or pauses (after DOUBLE_TAP_MS, to tell the two apart).

const ZOOMS = [0.5, 1.5, 4]; // px per second of concert
const DEFAULT_ZOOM = 1;
const DOUBLE_TAP_MS = 260;

type RvfcVideo = HTMLVideoElement & { requestVideoFrameCallback?: (callback: () => void) => number };

export type SeekRequest = { clipId: string; nonce: number } | null;

type ConcertPlayerProps = {
  timeline: ConcertTimeline;
  title: string;
  stageChip?: React.ReactNode;
  // A song tapped in the setlist: play this clip.
  seekRequest?: SeekRequest;
  onActiveSongChange?: (songId: string | null) => void;
  onDuration?: (momentId: string, seconds: number) => void;
  // A clip played VIEW_AFTER_MS (default: count it in post_views).
  onView?: (momentId: string) => void;
  // Most of the stage on screen: playback runs only then (autoplay on
  // arrival, pause on leaving; a pause by the viewer is kept).
  inView?: boolean;
  // Space the page keeps over the bottom of the stage (its fixed bottom nav
  // and action bar): the controls and tracks sit right above it.
  bottomClearance?: string;
  // The page's own controls (setlist, photos, upload…): a row of small
  // pills at the very bottom, under the tracks.
  actions?: React.ReactNode;
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

const ConcertPlayer: React.FC<ConcertPlayerProps> = ({
  timeline,
  title,
  stageChip,
  seekRequest,
  onActiveSongChange,
  onDuration,
  onView = recordPostView,
  inView = true,
  bottomClearance = 'calc(84px + env(safe-area-inset-bottom, 0px))',
  actions,
}) => {
  const tracksRef = useRef<ConcertTracksHandle | null>(null);
  const videosRef = useRef(new Map<string, HTMLVideoElement>());
  const timelineRef = useRef(timeline);
  const tRef = useRef(timeline.start);
  const activeRef = useRef<Clip | null>(null);
  const manualRef = useRef<ManualChoice>(null);
  const playingRef = useRef(true);
  const visibleRef = useRef(inView);
  const mutedRef = useRef(true);
  const scrubbingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const lastFrameRef = useRef<number | null>(null);
  const lastDisplayRef = useRef(0);
  // Which clip is on screen and since when (concert time): no early cuts.
  const holdRef = useRef<Hold>(null);
  const onViewRef = useRef(onView);
  onViewRef.current = onView;
  // Real playback of the clip on screen, to count a view after 3 s.
  const playedRef = useRef<{ clipId: string | null; ms: number; counted?: boolean }>({ clipId: null, ms: 0 });
  // Seamless cuts: the active video once it shows the right frame, the one
  // kept on screen until then, and per video whether a frame was presented
  // since its last seek.
  const revealedRef = useRef<string | null>(null);
  const handoffRef = useRef<string | null>(null);
  const presentedRef = useRef(new Map<string, boolean>());
  const handoffTimerRef = useRef(0);
  const fadeTimerRef = useRef(0);
  const slotOrderRef = useRef<string[]>([]);
  const upcomingRef = useRef<{ clip: Clip; at: number } | null>(null);
  const tapRef = useRef({ at: 0, timer: 0 });
  // The clip on screen that has buffered enough for the next one to preload
  // fully, and the one that has shown its first frame (no more «Cargando»).
  const warmRef = useRef<string | null>(null);
  const framedRef = useRef<string | null>(null);
  const burstTimerRef = useRef(0);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [manual, setManual] = useState<ManualChoice>(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [ended, setEnded] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [following, setFollowing] = useState(true);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [displayTime, setDisplayTime] = useState(timeline.start);
  const [shapes, setShapes] = useState<Record<string, boolean>>({});
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [handoffId, setHandoffIdState] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);
  const [warmId, setWarmId] = useState<string | null>(null);
  const [framedId, setFramedId] = useState<string | null>(null);
  const { likedIds, ready: likesReady, setLiked } = usePostLikes();
  // Liked or not when the like counts were loaded (once the set is known).
  const [likedAtLoad, setLikedAtLoad] = useState<Record<string, boolean>>({});

  const active = useMemo(() => timeline.clips.find(clip => clip.id === activeId) ?? null, [timeline.clips, activeId]);
  const covering = useMemo(() => clipsAt(timeline, displayTime), [timeline, displayTime]);
  const coveringIds = useMemo(() => new Set(covering.map(clip => clip.id)), [covering]);
  const upcoming = useMemo(
    () => upcomingCut(timeline, tRef.current, manual, holdRef.current),
    // Recomputed when the angle changes, not every frame.
    [timeline, activeId, manual],
  );
  upcomingRef.current = upcoming;
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
    const offset = clipOffsetSec(clip, tRef.current);
    if (Math.abs(video.currentTime - offset) > SEEK_TOLERANCE_SEC) {
      try {
        video.currentTime = offset;
      } catch {
        // Not seekable yet: loadedmetadata seeks it.
      }
    }
    if (playingRef.current && visibleRef.current && !scrubbingRef.current) {
      video.play().catch(() => {
        // Autoplay refused (power saving, no gesture yet): wait for a tap.
        playingRef.current = false;
        setPlaying(false);
      });
    } else if (!video.paused) {
      video.pause();
    }
  }, []);

  const setHandoff = useCallback((clipId: string | null) => {
    handoffRef.current = clipId;
    setHandoffIdState(clipId);
  }, []);

  /** The active video shows the right frame: fade it in, then drop the outgoing one. */
  const reveal = useCallback((clipId: string) => {
    if (revealedRef.current === clipId) return;
    revealedRef.current = clipId;
    setRevealedId(clipId);
    window.clearTimeout(handoffTimerRef.current);
    window.clearTimeout(fadeTimerRef.current);
    if (handoffRef.current) {
      fadeTimerRef.current = window.setTimeout(() => {
        if (revealedRef.current === clipId) setHandoff(null);
      }, CROSSFADE_MS + 30);
    }
  }, [setHandoff]);

  const checkReveal = useCallback(() => {
    const clip = activeRef.current;
    if (!clip || clip.kind !== 'video' || revealedRef.current === clip.id) return;
    const video = videosRef.current.get(clip.id);
    if (!video) return;
    const ready = frameReadyAt(
      {
        readyState: video.readyState,
        seeking: video.seeking,
        currentTime: video.currentTime,
        presented: presentedRef.current.get(clip.id) ?? false,
      },
      clipOffsetSec(clip, tRef.current),
    );
    if (ready) reveal(clip.id);
  }, [reveal]);

  // A frame of `clipId` reached the screen (requestVideoFrameCallback) or at
  // least the decoder (seeked/loadeddata/playing/timeupdate: where rVFC is
  // missing, or does not fire for a video kept transparent).
  const markPresented = useCallback((clipId: string, video: HTMLVideoElement) => {
    if (video.seeking || video.readyState < 2) return;
    presentedRef.current.set(clipId, true);
    if (clipId !== activeRef.current?.id) return;
    if (framedRef.current !== clipId) {
      framedRef.current = clipId;
      setFramedId(clipId);
    }
    checkReveal();
  }, [checkReveal]);

  /** The clip on screen can play on its own: the next one may load fully. */
  const markWarm = useCallback((clipId: string) => {
    if (warmRef.current === clipId || clipId !== activeRef.current?.id) return;
    warmRef.current = clipId;
    setWarmId(clipId);
  }, []);

  const watchFrame = useCallback((clipId: string, video: HTMLVideoElement) => {
    const rvfc = (video as RvfcVideo).requestVideoFrameCallback;
    if (typeof rvfc !== 'function') return;
    rvfc.call(video, () => markPresented(clipId, video));
  }, [markPresented]);

  /** Seeks the next clip to where the cut will enter it, while it waits hidden. */
  const primeUpcoming = useCallback(() => {
    const cut = upcomingRef.current;
    if (!cut || cut.clip.kind !== 'video' || cut.clip.id === activeRef.current?.id) return;
    const video = videosRef.current.get(cut.clip.id);
    if (!video || video.readyState < 1) return; // loadedmetadata primes it
    const offset = clipOffsetSec(cut.clip, cut.at);
    if (Math.abs(video.currentTime - offset) <= SEEK_TOLERANCE_SEC) return;
    try {
      video.currentTime = offset;
    } catch {
      // Not seekable yet: activation seeks it.
    }
  }, []);

  const activate = useCallback((clip: Clip | null) => {
    const previous = activeRef.current;
    if (previous?.id === clip?.id) return;
    // What stays on screen until the new video has its frame.
    const from = handoffSource({
      previousId: previous?.id ?? null,
      previousIsVideo: previous?.kind === 'video',
      revealedId: revealedRef.current,
      handoffId: handoffRef.current,
      nextId: clip?.id ?? null,
      nextIsVideo: clip?.kind === 'video',
    });
    activeRef.current = clip;
    holdRef.current = clip ? { clipId: clip.id, since: tRef.current } : null;
    playedRef.current = { clipId: clip?.id ?? null, ms: 0 };
    setActiveId(clip?.id ?? null);
    setBuffering(false);
    window.clearTimeout(handoffTimerRef.current);
    window.clearTimeout(fadeTimerRef.current);
    revealedRef.current = null;
    setRevealedId(null);
    setHandoff(from && videosRef.current.has(from) ? from : null);
    if (clip?.kind === 'video') {
      // Never stuck on the old picture: show the new clip (and its spinner).
      handoffTimerRef.current = window.setTimeout(() => {
        if (activeRef.current?.id === clip.id) reveal(clip.id);
      }, HANDOFF_TIMEOUT_MS);
    }
    // The new <video> may still need to mount; the effect below syncs it then.
    syncVideo(clip);
    checkReveal();
  }, [checkReveal, reveal, setHandoff, syncVideo]);

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
    const resolved = resolvePlayhead(tl, t, keep, holdRef.current);
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

  // One view once a clip has really played VIEW_AFTER_MS (a photo: shown
  // almost its whole 3 s). Imported clips play in their own app: not counted.
  const countPlayback = useCallback((clip: Clip, deltaMs: number) => {
    if (clip.kind === 'external' || deltaMs <= 0 || deltaMs > 1000) return;
    const played = playedRef.current;
    if (played.clipId !== clip.id) return;
    played.ms += deltaMs;
    const needed = Math.min(VIEW_AFTER_MS, clip.end - clip.start - 150);
    if (played.ms >= needed && !played.counted) {
      played.counted = true;
      onViewRef.current(clip.id);
    }
  }, []);

  // The clock.
  useEffect(() => {
    let frame = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const last = lastFrameRef.current;
      lastFrameRef.current = now;
      if (!playingRef.current || !visibleRef.current || scrubbingRef.current || last === null) return;
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
      const previous = tRef.current;
      const resolved = resolvePlayhead(tl, t, chosen, holdRef.current);
      if (resolved.ended && !resolved.clip) {
        tRef.current = tl.end;
        playingRef.current = false;
        setPlaying(false);
        setEnded(true);
        publishTime(tl.end, true);
        return;
      }
      tRef.current = resolved.t;
      if (clip && resolved.clip?.id === clip.id) {
        countPlayback(clip, resolved.t - previous);
        if (clip.kind === 'video' && playedRef.current.ms >= WARM_AFTER_MS) markWarm(clip.id);
      }
      if (resolved.clip?.id !== clip?.id) activate(resolved.clip);
      publishTime(resolved.t);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [activate, countPlayback, markWarm, publishTime]);

  // The stage scrolled in or out: start or stop the picture (the clock
  // above stops by itself).
  useEffect(() => {
    visibleRef.current = inView;
    syncVideo(activeRef.current);
  }, [inView, syncVideo]);

  // A newly mounted <video> for the clip on screen gets its time and plays.
  useEffect(() => {
    syncVideo(active);
    checkReveal();
  }, [active, syncVideo, checkReveal]);

  // The next clip, once mounted: seek it to where the cut will enter it.
  useEffect(() => {
    primeUpcoming();
  }, [upcoming, handoffId, primeUpcoming]);

  useEffect(() => {
    const tap = tapRef.current;
    return () => {
      window.clearTimeout(handoffTimerRef.current);
      window.clearTimeout(fadeTimerRef.current);
      window.clearTimeout(tap.timer);
      window.clearTimeout(burstTimerRef.current);
    };
  }, []);

  // The like count each clip was loaded with already includes this person's
  // like if they had given it: remember which, once their likes are known.
  useEffect(() => {
    if (!likesReady || !active || likedAtLoad[active.id] !== undefined) return;
    setLikedAtLoad(previous => ({ ...previous, [active.id]: likedIds.has(active.id) }));
  }, [likesReady, active, likedIds, likedAtLoad]);

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
  // The delayed single tap runs the latest version (not the one at the tap).
  const togglePlayRef = useRef(togglePlay);
  togglePlayRef.current = togglePlay;

  const liked = active ? likedIds.has(active.id) : false;
  const likeCount = active ? likesShown(active.moment.likes ?? 0, likedAtLoad[active.id] ?? liked, liked) : 0;

  const toggleLike = () => {
    if (active) setLiked(active.id, !liked);
  };

  const showBurst = () => {
    window.clearTimeout(burstTimerRef.current);
    setBurst(value => value + 1);
    burstTimerRef.current = window.setTimeout(() => setBurst(0), 750);
  };

  // One tap plays or pauses; two quick taps like the clip (never unlike).
  const onPictureTap = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (!(target === event.currentTarget || target.tagName === 'VIDEO' || target.tagName === 'IMG')) return;
    const tap = tapRef.current;
    const now = performance.now();
    window.clearTimeout(tap.timer);
    if (tap.at && now - tap.at < DOUBLE_TAP_MS) {
      tap.at = 0;
      if (active && setLiked(active.id, true)) showBurst();
      return;
    }
    tap.at = now;
    tap.timer = window.setTimeout(() => {
      tap.at = 0;
      togglePlayRef.current();
    }, DOUBLE_TAP_MS);
  };

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
    else {
      videosRef.current.delete(clipId);
      presentedRef.current.delete(clipId);
    }
  };

  const handoffClip = handoffId ? timeline.clips.find(clip => clip.id === handoffId) ?? null : null;
  const videoClips = videoSlots(active, upcoming?.clip ?? null, handoffClip, slotOrderRef.current);
  slotOrderRef.current = videoClips.map(clip => clip.id);

  // Horizontal clips sit whole over the blurred backdrop; vertical ones fill
  // the screen. Stored size first, the decoded video's size once known.
  const isLandscape = (item: TimelineMoment) =>
    shapes[item.id] ?? Boolean(item.width && item.height && item.width > item.height);
  const moment = active?.moment ?? null;
  const landscape = moment ? isLandscape(moment) : false;
  const backdrop = moment?.thumbnailUrl || (moment?.mediaType === 'image' ? moment.mediaUrl : null);
  const handle = active ? timeline.tracks.find(track => track.id === active.trackId)?.label ?? '' : '';
  const angleCount = covering.length;
  // Nothing of the clip on screen yet (its first video frame is still
  // downloading, and no outgoing picture stands in): say it is loading.
  const pictureLoading =
    !ended
    && (!active
      || (active.kind === 'video'
        && framedId !== active.id
        && !(handoffId !== null && revealedId !== active.id)));

  return (
    <section className="relative h-full w-full overflow-hidden bg-black" aria-label="Reproductor del concierto">
      {/* Backdrop: a blurred, enlarged copy of the frame. A horizontal clip
          sits over it at its own shape instead of between black bands. */}
      {backdrop ? (
        <img src={backdrop} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-2xl" />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,91,46,0.28),transparent_65%)]" />
      )}

      {/* Picture: fills the screen; a tap plays or pauses, two like. */}
      <div className="absolute inset-0 z-0 touch-manipulation" onClick={onPictureTap}>
        {videoClips.map(clip => {
          const isActive = clip.id === active?.id;
          // On top once it shows the right frame (fading in over the
          // outgoing one); the outgoing one under it; the next one hidden.
          const layer = isActive
            ? revealedId === clip.id
              ? 'z-[2] opacity-100 transition-opacity ease-out motion-reduce:transition-none'
              : 'z-[2] opacity-0'
            : clip.id === handoffId
              ? 'pointer-events-none z-[1] opacity-100'
              : 'pointer-events-none z-0 opacity-0';
          return (
            <video
              key={clip.id}
              ref={registerVideo(clip.id)}
              src={clip.moment.mediaUrl}
              // Always a poster: without one Android paints a grey play icon.
              poster={videoPoster(clip.moment.thumbnailUrl)}
              muted={muted}
              playsInline
              preload={videoPreload({
                isActive,
                isHandoff: clip.id === handoffId,
                activeIsVideo: active?.kind === 'video',
                activeWarm: Boolean(active && warmId === active.id),
              })}
              aria-hidden={!isActive}
              style={isActive ? { transitionDuration: `${CROSSFADE_MS}ms` } : undefined}
              className={`absolute inset-0 h-full w-full ${isLandscape(clip.moment) ? 'object-contain' : 'object-cover'} ${layer}`}
              onLoadedMetadata={event => {
                const video = event.currentTarget;
                if (Number.isFinite(video.duration) && !clip.moment.durationSec) onDuration?.(clip.id, video.duration);
                if (video.videoWidth && video.videoHeight) {
                  const wide = video.videoWidth > video.videoHeight;
                  setShapes(previous => (previous[clip.id] === wide ? previous : { ...previous, [clip.id]: wide }));
                }
                if (clip.id === activeRef.current?.id) syncVideo(activeRef.current);
                else primeUpcoming();
              }}
              onSeeking={event => {
                presentedRef.current.set(clip.id, false);
                watchFrame(clip.id, event.currentTarget);
              }}
              onLoadedData={event => markPresented(clip.id, event.currentTarget)}
              onSeeked={event => markPresented(clip.id, event.currentTarget)}
              onTimeUpdate={event => markPresented(clip.id, event.currentTarget)}
              onCanPlayThrough={() => markWarm(clip.id)}
              onWaiting={() => clip.id === activeRef.current?.id && setBuffering(true)}
              onPlaying={event => {
                if (clip.id === activeRef.current?.id) setBuffering(false);
                markPresented(clip.id, event.currentTarget);
              }}
              onError={() => {
                // Broken file: skip to what comes after it.
                if (clip.id === activeRef.current?.id) goTo(clip.end, null);
              }}
            />
          );
        })}

        {active?.kind === 'photo' && moment ? (
          <img
            key={active.id}
            src={moment.mediaUrl}
            alt={`Foto de ${handle}`}
            className={`absolute inset-0 z-[3] h-full w-full ${landscape ? 'object-contain' : 'object-cover'}`}
          />
        ) : null}

        {active?.kind === 'external' && moment?.post ? (
          // Playing the original pauses the concert clock: it is not ours to time.
          <div key={active.id} className="absolute inset-0 z-[3] mx-auto max-w-[480px]" onClickCapture={() => pause()}>
            <ExternalMomentCard post={moment.post} variant="media" />
          </div>
        ) : null}
      </div>

      {/* Shade under the top bar and under the controls. */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.5)_0%,rgba(0,0,0,0)_18%,rgba(0,0,0,0)_42%,rgba(0,0,0,0.7)_62%,rgba(0,0,0,0.9)_100%)]" />

      {(buffering || pictureLoading) && playing ? (
        <div className="pointer-events-none absolute left-1/2 top-[38%] h-10 w-10 -translate-x-1/2 -translate-y-1/2 animate-spin rounded-full border-2 border-white/25 border-t-white motion-reduce:animate-none" />
      ) : null}

      {pictureLoading ? (
        <p
          role="status"
          className="pointer-events-none absolute left-1/2 top-[calc(38%+44px)] -translate-x-1/2 whitespace-nowrap rounded-full bg-black/45 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-white/85 backdrop-blur"
        >
          Cargando el concierto…
        </p>
      ) : null}

      {!playing && active?.kind !== 'external' ? (
        <button
          type="button"
          aria-label={ended ? 'Volver a ver desde el principio' : 'Reproducir'}
          onClick={play}
          className="absolute left-1/2 top-[38%] flex h-16 min-w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-2 rounded-full bg-app-ink/90 px-5 text-app-bg shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
        >
          <PlayPauseIcon playing={false} size={26} />
          {ended ? <span className="text-sm font-bold">Volver a ver</span> : null}
        </button>
      ) : null}

      {/* Between the page's back and share buttons (44 px each, 12 px in). */}
      {stageChip ? (
        <div className="pointer-events-none absolute inset-x-[64px] top-[calc(14px+env(safe-area-inset-top,0px))] z-10 flex justify-center">
          <div className="min-w-0 max-w-full">{stageChip}</div>
        </div>
      ) : null}

      {burst ? (
        <div
          key={burst}
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[38%] z-10 -translate-x-1/2 -translate-y-1/2 text-app-accent drop-shadow-[0_6px_24px_rgba(0,0,0,0.45)]"
        >
          <div className="animate-like-burst motion-reduce:animate-none">
            <IconHeartFilled size={96} />
          </div>
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

      {/* Controls over the bottom of the picture, clear of the page's
          bottom nav and action bar. */}
      <div className="absolute inset-x-0 bottom-0 z-10 px-3" style={{ paddingBottom: bottomClearance }}>
        <div className="flex items-end gap-2">
          {/* Caption */}
          <div className="pointer-events-none min-w-0 flex-1 pb-1">
            {segment ? (
              <p className="truncate font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-app-accent">
                Suena · {String(segment.ordinal).padStart(2, '0')} {segment.title}
                {segment.estimated ? ' ~' : ''}
              </p>
            ) : null}
            <p className="mt-0.5 truncate font-display text-[19px] font-bold leading-tight text-white drop-shadow">
              {moment ? handle : title}
              {moment ? <span className="font-mono text-[14px] font-semibold text-white/75"> · {clock(active!.start, false)}</span> : null}
            </p>
            {active?.placement === 'song' ? (
              <p className="mt-0.5 text-[11px] text-white/60">Sin hora exacta: colocado en su canción</p>
            ) : null}
          </div>
          {/* Right column, stacked like short-video apps. */}
          <div className="flex shrink-0 flex-col items-center gap-2">
            {active ? (
              <button
                type="button"
                onClick={toggleLike}
                aria-pressed={liked}
                aria-label={liked ? `Quitar me gusta (${likeCount})` : `Me gusta (${likeCount})`}
                className="flex w-12 flex-col items-center gap-0.5 text-white"
              >
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-full bg-black/45 backdrop-blur ${
                    liked ? 'text-app-accent' : 'text-white'
                  }`}
                >
                  {liked ? <IconHeartFilled size={24} /> : <IconHeart size={24} />}
                </span>
                <span className="font-mono text-[11px] font-bold tabular-nums drop-shadow">{likeCount}</span>
              </button>
            ) : null}
            {active && active.kind !== 'external' ? (
              <ReportMomentButton
                postId={active.id}
                authorId={active.moment.userId}
                authorLabel={active.moment.userName ? `@${active.moment.userName}` : undefined}
                variant="round"
              />
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

        {/* Transport */}
        <div className="flex items-center gap-2 pb-2 pt-2.5">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? 'Pausar' : 'Reproducir'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-accent text-[#14151a]"
          >
            <PlayPauseIcon playing={playing} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[15px] font-bold tabular-nums text-white" aria-live="off">{clock(displayTime)}</p>
            <p className="truncate text-[11px] text-white/60">
              {timeline.clips.length} momentos · {timeline.tracks.length} {timeline.tracks.length === 1 ? 'persona' : 'personas'}
              {angleCount > 1 ? ` · ${angleCount} ángulos ahora` : ''}
            </p>
          </div>
          {!following ? (
            <button
              type="button"
              onClick={backToNow}
              className="h-11 shrink-0 rounded-full border border-app-accent/60 bg-black/40 px-3.5 text-[13px] font-bold text-app-accent backdrop-blur"
            >
              Volver al ahora
            </button>
          ) : null}
          <div className="flex shrink-0 overflow-hidden rounded-full border border-white/20 bg-black/35 backdrop-blur">
            <button
              type="button"
              aria-label="Alejar la línea de tiempo"
              disabled={zoom === 0}
              onClick={() => setZoom(value => Math.max(0, value - 1))}
              className="flex h-11 w-11 items-center justify-center text-lg font-bold text-white disabled:text-white/25"
            >
              −
            </button>
            <button
              type="button"
              aria-label="Acercar la línea de tiempo"
              disabled={zoom === ZOOMS.length - 1}
              onClick={() => setZoom(value => Math.min(ZOOMS.length - 1, value + 1))}
              className="flex h-11 w-11 items-center justify-center border-l border-white/20 text-lg font-bold text-white disabled:text-white/25"
            >
              +
            </button>
          </div>
        </div>

        <ConcertTracks
          ref={tracksRef}
          overlay
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

        {actions ? <div className="flex items-center gap-2 pt-2.5">{actions}</div> : null}
      </div>
    </section>
  );
};

export default ConcertPlayer;
