import { Network, type ConnectionStatus } from '@capacitor/network';
import { getReuseConsent } from '../features/community/licence';
import { supabase } from '../lib/supabase';
import { getConfiguredMediaProvider } from './configured';
import { isMediaUploadError, MediaUploadError } from './errors';
import { IMAGE_MAX_BYTES, VIDEO_MAX_BYTES, VIDEO_MAX_DURATION_SECONDS } from './limits';
import {
  compressMomentVideo,
  deleteNativeFile,
  isNativeMediaAvailable,
  LiveSpaceMedia,
  readNativeFile,
  type CaptureLocation,
} from './native';
import { isR2VideoType, uploadSessionParts, type R2CompletedPart, type R2MediaProvider, type R2Session, type UploadSource } from './r2';
import type { MediaKind } from './types';
import { deleteStoredJob, loadStoredJobs, saveStoredJob, type StoredRecord } from './uploadQueueStore';
import { waitForMediaAssetId } from './uploadPost';
import { extractVideoThumbnail, probeVideo } from './videoProbe';

/**
 * Background, resumable upload queue for concert moments.
 *
 * - Jobs persist in IndexedDB (File objects on web, native paths on the app)
 *   and resume after a restart, a lost connection or the app coming back.
 * - Native videos are compressed on the device first (src/media/native).
 * - Videos go to R2 in parts (8 MB, each retried with backoff and persisted as
 *   it finishes) when the server enables R2; otherwise to Cloudinary.
 * - Optional "solo con wifi": the queue waits while on mobile data.
 * - Each finished upload becomes a post on its event (status review).
 *
 * UI: useUploadQueue() and <UploadProgressPill />. Entry point for screens:
 * enqueueMomentUploads().
 */

export type MomentUploadItem = {
  /** A picked File (web, or <input type="file"> in the app). */
  file?: File | null;
  /** A native path from pickMomentVideos() (compressed on the device). */
  nativePath?: string | null;
  eventId: string;
  /** Song of the setlist the clip belongs to; its song becomes posts.song_id. */
  setlistItemId?: string | null;
  /** Catalogue song id, when the caller already knows it (wins over setlistItemId). */
  songId?: string | null;
  /** Reuse licence for the artist and venue; defaults to the remembered choice. */
  allowReuse?: boolean;
  /** When it was recorded; falls back to the file's own capture date. */
  capturedAt?: string | Date | null;
  caption?: string | null;
  /** Inferred from the file type, or from the native file itself. */
  kind?: MediaKind;
};

export type UploadJobStatus =
  | 'queued'
  | 'compressing'
  | 'uploading'
  | 'finalizing'
  | 'waiting_network'
  | 'waiting_wifi'
  | 'retrying'
  | 'done'
  | 'failed';

export type PreparedVideo = {
  /** Native compressed file, or null when the File is uploaded as is. */
  path: string | null;
  thumbnailPath: string | null;
  sizeBytes: number;
  durationSeconds: number;
  width: number | null;
  height: number | null;
  contentType: string;
};

export type UploadJob = {
  id: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
  eventId: string;
  setlistItemId: string | null;
  songId: string | null;
  allowReuse: boolean;
  capturedAt: string | null;
  /** From the source file; kept on the device, never uploaded. */
  captureLocation: CaptureLocation | null;
  caption: string | null;
  kind: MediaKind;
  fileName: string;
  file: File | null;
  nativePath: string | null;
  prepared: PreparedVideo | null;
  status: UploadJobStatus;
  /** 0..1 while compressing. */
  compressProgress: number;
  loadedBytes: number;
  totalBytes: number;
  attempts: number;
  nextAttemptAt: number;
  error: string | null;
  provider: 'r2' | 'cloudinary' | null;
  /** Cloudinary reservation already uploaded; only its webhook is awaited on retries. */
  cloudinaryReservationId: string | null;
  r2: {
    reservationId: string;
    key: string;
    completedParts: R2CompletedPart[];
    /** Every byte is on R2 (single PUT or all parts); only complete() is left. */
    bodyUploaded: boolean;
    posterDone: boolean;
    thumbnailReservationId: string | null;
  } | null;
  mediaAssetId: string | null;
  postId: string | null;
};

export type UploadQueueSnapshot = {
  jobs: UploadJob[];
  wifiOnly: boolean;
  online: boolean;
  onCellular: boolean;
};

type QueueDeps = {
  provider: () => R2MediaProvider;
  currentUserId: () => Promise<string | null>;
  waitForAsset: (reservationId: string, kind: MediaKind) => Promise<string>;
  resolveSongId: (setlistItemId: string) => Promise<string | null>;
  createPost: (input: {
    authorId: string;
    mediaAssetId: string;
    eventId: string;
    capturedAt: string | null;
    caption: string | null;
    songId: string | null;
    allowReuse: boolean;
  }) => Promise<string>;
};

const MAX_ATTEMPTS = 10;
const WIFI_ONLY_KEY = 'ls.uploads.wifiOnly';
const FINISHED_RETENTION_MS = 24 * 60 * 60 * 1000;
const ACTIVE_STATUSES: UploadJobStatus[] = ['compressing', 'uploading', 'finalizing', 'retrying'];

const backoffMs = (attempts: number) => {
  const base = Math.min(5 * 60_000, 2_000 * 2 ** Math.max(0, attempts - 1));
  return base / 2 + Math.random() * (base / 2);
};

const readWifiOnly = () => {
  try {
    return globalThis.localStorage?.getItem(WIFI_ONLY_KEY) === '1';
  } catch {
    return false;
  }
};

const writeWifiOnly = (value: boolean) => {
  try {
    globalThis.localStorage?.setItem(WIFI_ONLY_KEY, value ? '1' : '0');
  } catch {
    // Per-device convenience only.
  }
};

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const toIso = (value: string | Date | null | undefined) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/** Error classification: permanent failures are not retried automatically. */
type Failure = { permanent: boolean; restart: boolean; waitForAuth: boolean; longWait?: boolean; message: string };

const classify = (error: unknown): Failure => {
  const fallback = 'No se pudo subir. Lo reintentaremos.';
  if (isMediaUploadError(error)) {
    const status = error.status ?? 0;
    switch (error.code) {
      case 'authentication_required':
        return { permanent: false, restart: false, waitForAuth: true, message: 'Entra en tu cuenta para seguir subiendo.' };
      case 'quota_exceeded':
        return { permanent: true, restart: false, waitForAuth: false, message: 'Has llegado al límite de vídeos de este mes.' };
      case 'upload_rejected':
      case 'unsupported_media':
      case 'file_too_large':
        return { permanent: true, restart: false, waitForAuth: false, message: error.message };
      case 'authorization_failed':
        if (status === 403 && /paused/i.test(error.message)) {
          return { permanent: false, restart: false, waitForAuth: false, longWait: true, message: 'Las subidas están en pausa; seguiremos más tarde.' };
        }
        if (status === 410 || (status === 409 && /part|uploaded/i.test(error.message))) {
          return { permanent: false, restart: true, waitForAuth: false, message: fallback };
        }
        if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
          return { permanent: true, restart: false, waitForAuth: false, message: error.message };
        }
        return { permanent: false, restart: false, waitForAuth: false, message: fallback };
      case 'upload_failed':
        if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
          return { permanent: false, restart: true, waitForAuth: false, message: fallback };
        }
        return { permanent: false, restart: false, waitForAuth: false, message: fallback };
      default:
        return { permanent: false, restart: false, waitForAuth: false, message: fallback };
    }
  }
  return { permanent: false, restart: false, waitForAuth: false, message: fallback };
};

const VIDEO_PATH = /\.(mp4|mov|m4v|3gp|webm|mkv)$|\/video\//i;
const IMAGE_PATH = /\.(jpe?g|png|heic|heif|webp|gif)$|\/images?\//i;

/** Native paths from GalleryScan or pickMomentVideos can be photos or videos. */
const inferNativeKind = async (path: string): Promise<MediaKind> => {
  if (VIDEO_PATH.test(path)) return 'video';
  if (IMAGE_PATH.test(path)) return 'image';
  if (!isNativeMediaAvailable()) return 'video';
  try {
    const info = await LiveSpaceMedia.getVideoInfo({ path });
    return info.durationSeconds > 0 ? 'video' : 'image';
  } catch {
    return 'image';
  }
};

export class UploadQueue {
  private jobs: UploadJob[] = [];
  private snapshot: UploadQueueSnapshot;
  private readonly listeners = new Set<() => void>();
  private wifiOnly = readWifiOnly();
  private network: Pick<ConnectionStatus, 'connected' | 'connectionType'> = { connected: true, connectionType: 'unknown' };
  private running = false;
  private kickAgain = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private initPromise: Promise<void> | null = null;
  private active: { id: string; controller: AbortController } | null = null;
  /** Only this user's jobs are shown and processed (shared devices). */
  private userId: string | null = null;

  constructor(private readonly deps: QueueDeps) {
    this.snapshot = this.buildSnapshot();
  }

  // -- public API ----------------------------------------------------------

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    void this.init();
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  init() {
    if (!this.initPromise) this.initPromise = this.initialize();
    return this.initPromise;
  }

  async enqueue(items: MomentUploadItem[]): Promise<string[]> {
    await this.init();
    const ownerId = await this.deps.currentUserId();
    if (!ownerId) throw new MediaUploadError('authentication_required', 'Entra en tu cuenta para subir momentos.');
    this.userId = ownerId;
    const now = Date.now();
    const defaultReuse = getReuseConsent();
    const created: UploadJob[] = [];
    for (const item of items) {
      const file = item.file ?? null;
      const nativePath = item.nativePath ?? null;
      if (!file && !nativePath) throw new Error('Each upload needs a file or a nativePath.');
      if (!item.eventId) throw new Error('Each upload needs an eventId.');
      const kind: MediaKind = item.kind ??
        (file ? (file.type.toLowerCase().startsWith('video/') ? 'video' : 'image') : await inferNativeKind(nativePath!));
      created.push({
        id: newId(),
        ownerId,
        createdAt: now,
        updatedAt: now,
        eventId: item.eventId,
        setlistItemId: item.setlistItemId ?? null,
        songId: item.songId ?? null,
        allowReuse: item.allowReuse ?? defaultReuse,
        capturedAt: toIso(item.capturedAt),
        captureLocation: null,
        caption: item.caption?.trim() || null,
        kind,
        fileName: file?.name ?? nativePath?.split('/').pop() ?? 'video',
        file,
        nativePath,
        prepared: null,
        status: 'queued',
        compressProgress: 0,
        loadedBytes: 0,
        totalBytes: file?.size ?? 0,
        attempts: 0,
        nextAttemptAt: 0,
        error: null,
        provider: null,
        cloudinaryReservationId: null,
        r2: null,
        mediaAssetId: null,
        postId: null,
      });
    }
    this.jobs = [...this.jobs, ...created];
    this.emit();
    await Promise.all(created.map((job) => this.persist(job)));
    this.kick();
    return created.map((job) => job.id);
  }

  /** Retry a failed job now (also clears its backoff). */
  retry(id: string) {
    this.patch(id, { status: 'queued', attempts: 0, nextAttemptAt: 0, error: null }, true);
    this.kick();
  }

  retryAll() {
    for (const job of this.jobs) {
      if (job.status !== 'done') this.patch(job.id, { attempts: 0, nextAttemptAt: 0, error: null, status: 'queued' }, true);
    }
    this.kick();
  }

  /** Cancel and forget a job; frees its R2 reservation and temporary files. */
  async remove(id: string) {
    const job = this.jobs.find((candidate) => candidate.id === id);
    if (!job) return;
    if (this.active?.id === id) this.active.controller.abort();
    this.jobs = this.jobs.filter((candidate) => candidate.id !== id);
    this.emit();
    await deleteStoredJob(id);
    if (job.r2 && !job.mediaAssetId) {
      await this.deps.provider().client.abort(job.r2.reservationId).catch(() => undefined);
    }
    await this.cleanupFiles(job);
  }

  /** Drop finished jobs from the list (they are already posts). */
  async clearFinished() {
    const finished = this.jobs.filter((job) => job.status === 'done');
    this.jobs = this.jobs.filter((job) => job.status !== 'done');
    this.emit();
    await Promise.all(finished.map((job) => deleteStoredJob(job.id)));
  }

  setWifiOnly(value: boolean) {
    this.wifiOnly = value;
    writeWifiOnly(value);
    this.emit();
    this.kick();
  }

  /** Process queued jobs now (also called on network/app resume events). */
  kick = () => {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.running) {
      this.kickAgain = true;
      return;
    }
    void this.loop();
  };

  // -- internals -------------------------------------------------------------

  private async initialize() {
    const stored = (await loadStoredJobs()) as unknown as UploadJob[];
    const now = Date.now();
    const kept: UploadJob[] = [];
    for (const job of stored) {
      if (job.status === 'done' && now - job.updatedAt > FINISHED_RETENTION_MS) {
        await deleteStoredJob(job.id);
        continue;
      }
      kept.push(ACTIVE_STATUSES.includes(job.status) || job.status.startsWith('waiting')
        ? { ...job, status: 'queued', nextAttemptAt: 0 }
        : job);
    }
    const known = new Set(this.jobs.map((job) => job.id));
    this.jobs = [...kept.filter((job) => !known.has(job.id)), ...this.jobs].sort((a, b) => a.createdAt - b.createdAt);

    try {
      const status = await Network.getStatus();
      this.network = status;
      await Network.addListener('networkStatusChange', (next) => {
        this.network = next;
        this.emit();
        if (next.connected) this.kick();
      });
    } catch {
      // Without the plugin, assume online; failures are retried with backoff.
    }
    if (typeof document !== 'undefined') {
      const onVisible = () => {
        if (document.visibilityState === 'visible') this.kick();
      };
      document.addEventListener('visibilitychange', onVisible);
      document.addEventListener('resume', () => this.kick());
    }
    if (typeof window !== 'undefined') window.addEventListener('online', () => this.kick());
    this.userId = await this.deps.currentUserId().catch(() => null);

    this.emit();
    this.kick();
  }

  private buildSnapshot(): UploadQueueSnapshot {
    return {
      jobs: this.jobs.filter((job) => job.ownerId === this.userId),
      wifiOnly: this.wifiOnly,
      online: this.network.connected,
      onCellular: this.network.connectionType === 'cellular',
    };
  }

  private emit() {
    this.snapshot = this.buildSnapshot();
    this.listeners.forEach((listener) => listener());
  }

  private get(id: string) {
    return this.jobs.find((job) => job.id === id) ?? null;
  }

  private patch(id: string, changes: Partial<UploadJob>, persist = false) {
    let updated: UploadJob | null = null;
    this.jobs = this.jobs.map((job) => {
      if (job.id !== id) return job;
      updated = { ...job, ...changes, updatedAt: Date.now() };
      return updated;
    });
    this.emit();
    if (persist && updated) void this.persist(updated);
    return updated as UploadJob | null;
  }

  private async persist(job: UploadJob) {
    await saveStoredJob(job as unknown as StoredRecord);
  }

  private async cleanupFiles(job: UploadJob) {
    if (job.prepared?.path) await deleteNativeFile(job.prepared.path);
    if (job.prepared?.thumbnailPath) await deleteNativeFile(job.prepared.thumbnailPath);
    if (job.nativePath) await deleteNativeFile(job.nativePath);
  }

  private async loop() {
    this.running = true;
    // Two tabs share one IndexedDB: only the tab holding the lock uploads.
    const locks = (globalThis.navigator as Navigator | undefined)?.locks;
    try {
      if (locks?.request) {
        await locks.request('ls-upload-queue', { ifAvailable: true }, async (lock) => {
          if (lock) await this.drain();
          // Another tab is uploading; look again later in case it closes.
          else this.timer = setTimeout(this.kick, 30_000);
        });
      } else {
        await this.drain();
      }
    } finally {
      this.running = false;
      if (this.kickAgain) this.kick();
    }
  }

  private async drain() {
    for (;;) {
      this.kickAgain = false;
      const now = Date.now();
      const pending = this.jobs.filter((job) => job.status !== 'done' && job.status !== 'failed');
      if (pending.length === 0) break;

      const waiting: UploadJobStatus | null = !this.network.connected
        ? 'waiting_network'
        : this.wifiOnly && this.network.connectionType === 'cellular' ? 'waiting_wifi' : null;
      if (waiting) {
        for (const job of pending) {
          if (job.status !== waiting) this.patch(job.id, { status: waiting });
        }
        break;
      }

      const userId = await this.deps.currentUserId();
      if (userId !== this.userId) {
        this.userId = userId;
        this.emit();
      }
      const ready = pending.filter((job) => job.ownerId === userId && job.nextAttemptAt <= now);
      if (ready.length === 0) {
        const next = pending
          .filter((job) => job.ownerId === userId)
          .reduce((soonest, job) => Math.min(soonest, job.nextAttemptAt), Number.POSITIVE_INFINITY);
        if (Number.isFinite(next)) this.timer = setTimeout(this.kick, Math.max(1_000, next - now));
        break;
      }
      await this.process(ready[0].id);
    }
  }

  private async process(id: string) {
    const controller = new AbortController();
    this.active = { id, controller };
    try {
      await this.runJob(id, controller.signal);
    } catch (error) {
      if (!this.get(id)) return; // removed while running
      if (isMediaUploadError(error) && error.code === 'aborted') return;
      const job = this.get(id)!;
      const failure = classify(error);
      const attempts = job.attempts + 1;
      if (failure.restart) {
        // The reservation is gone or unusable: free it and start again.
        if (job.r2) void this.deps.provider().client.abort(job.r2.reservationId).catch(() => undefined);
        this.patch(id, { r2: null, provider: null, loadedBytes: 0 }, true);
      }
      if (failure.permanent || (attempts >= MAX_ATTEMPTS && !failure.longWait)) {
        this.patch(id, { status: 'failed', attempts, error: failure.permanent ? failure.message : 'No se pudo subir tras varios intentos.' }, true);
      } else {
        this.patch(id, {
          status: 'retrying',
          attempts,
          error: failure.message,
          nextAttemptAt: Date.now() + (failure.longWait ? 10 * 60_000 : failure.waitForAuth ? 30_000 : backoffMs(attempts)),
        }, true);
      }
      console.warn('Upload failed', job.fileName, error);
    } finally {
      this.active = null;
    }
  }

  private async runJob(id: string, signal: AbortSignal) {
    let job = this.get(id);
    if (!job) return;
    const userId = await this.deps.currentUserId();
    if (!userId) throw new MediaUploadError('authentication_required', 'Sign in before uploading media.');

    // 1. Prepare: compress native videos, check limits on the web fallback.
    if (!job.prepared && job.kind === 'video') job = await this.prepareVideo(job);
    if (job.kind === 'image' && job.file && job.file.size > IMAGE_MAX_BYTES) {
      throw new MediaUploadError('file_too_large', 'La foto pesa más de 10 MB.');
    }

    // 2. Upload and record the media asset.
    if (!job.mediaAssetId) {
      this.patch(id, { status: 'uploading', error: null });
      const mediaAssetId = job.kind === 'image'
        ? await this.uploadImage(job, signal)
        : await this.uploadVideo(job, signal);
      job = this.patch(id, { mediaAssetId, status: 'finalizing', loadedBytes: job.totalBytes }, true)!;
    }

    // 3. Create the post.
    if (!job.postId) {
      this.patch(id, { status: 'finalizing' });
      const songId = job.songId ??
        (job.setlistItemId ? await this.deps.resolveSongId(job.setlistItemId).catch(() => null) : null);
      const postId = await this.deps.createPost({
        authorId: userId,
        mediaAssetId: job.mediaAssetId!,
        eventId: job.eventId,
        capturedAt: job.capturedAt,
        caption: job.caption,
        songId,
        allowReuse: job.allowReuse !== false,
      });
      job = this.patch(id, { postId }, true)!;
    }

    // 4. Done: free the bytes, keep the record for the progress UI.
    await this.cleanupFiles(job);
    this.patch(id, { status: 'done', file: null, error: null, nextAttemptAt: 0 }, true);
  }

  private async prepareVideo(job: UploadJob): Promise<UploadJob> {
    if (job.nativePath && isNativeMediaAvailable()) {
      this.patch(job.id, { status: 'compressing', compressProgress: 0 });
      const compressed = await compressMomentVideo(job.nativePath, {
        taskId: job.id,
        onProgress: (fraction) => this.patch(job.id, { compressProgress: fraction }),
      }).catch((error) => {
        throw new MediaUploadError('unsupported_media', 'No se pudo comprimir este vídeo.', { cause: error });
      });
      if (!this.get(job.id)) {
        // Removed while compressing.
        await deleteNativeFile(compressed.path);
        await deleteNativeFile(compressed.thumbnailPath);
        throw new MediaUploadError('aborted', 'The media upload was cancelled.');
      }
      if (compressed.sizeBytes > VIDEO_MAX_BYTES) {
        await deleteNativeFile(compressed.path);
        throw new MediaUploadError('file_too_large', 'El vídeo comprimido supera 75 MB.');
      }
      const prepared: PreparedVideo = {
        path: compressed.path,
        thumbnailPath: compressed.thumbnailPath,
        sizeBytes: compressed.sizeBytes,
        durationSeconds: compressed.durationSeconds,
        width: compressed.width || null,
        height: compressed.height || null,
        contentType: compressed.contentType,
      };
      // The picked original (a private copy on iOS) is no longer needed.
      await deleteNativeFile(job.nativePath);
      return this.patch(job.id, {
        prepared,
        nativePath: null,
        totalBytes: compressed.sizeBytes,
        compressProgress: 1,
        capturedAt: job.capturedAt ?? compressed.capturedAt,
        captureLocation: compressed.location,
      }, true)!;
    }

    // Web fallback (or a File picked inside the app): no transcoding.
    let file = job.file;
    if (!file && job.nativePath) {
      const blob = await readNativeFile(job.nativePath, 'video/mp4');
      file = new File([blob], job.fileName, { type: blob.type || 'video/mp4' });
    }
    if (!file) throw new MediaUploadError('unsupported_media', 'No encontramos el archivo del vídeo.');
    if (file.size > VIDEO_MAX_BYTES) {
      throw new MediaUploadError('file_too_large', 'El vídeo pesa más de 75 MB.');
    }
    const probe = await probeVideo(file);
    if (probe && probe.durationSeconds > VIDEO_MAX_DURATION_SECONDS + 0.5) {
      throw new MediaUploadError('upload_rejected', 'El vídeo dura más de 45 s. Recórtalo antes de subirlo.');
    }
    const prepared: PreparedVideo = {
      path: null,
      thumbnailPath: null,
      sizeBytes: file.size,
      durationSeconds: probe?.durationSeconds ?? 0,
      width: probe?.width || null,
      height: probe?.height || null,
      contentType: file.type.toLowerCase() || 'video/mp4',
    };
    return this.patch(job.id, { prepared, file, totalBytes: file.size }, true)!;
  }

  private async uploadImage(job: UploadJob, signal: AbortSignal) {
    let file = job.file;
    if (!file && job.nativePath) {
      const blob = await readNativeFile(job.nativePath, 'image/jpeg');
      file = new File([blob], job.fileName, { type: blob.type || 'image/jpeg' });
    }
    if (job.cloudinaryReservationId) return this.deps.waitForAsset(job.cloudinaryReservationId, 'image');
    if (!file) throw new MediaUploadError('unsupported_media', 'No encontramos el archivo de la foto.');
    const result = await this.deps.provider().uploadToCloudinary({
      file,
      kind: 'image',
      eventId: job.eventId,
      purpose: 'user',
      signal,
      onProgress: (progress) => this.patch(job.id, { loadedBytes: progress.loadedBytes, totalBytes: progress.totalBytes }),
    });
    this.patch(job.id, { cloudinaryReservationId: result.reservationId }, true);
    return this.deps.waitForAsset(result.reservationId, 'image');
  }

  private async videoFile(job: UploadJob) {
    if (job.file) return job.file;
    if (job.prepared?.path) {
      const blob = await readNativeFile(job.prepared.path, 'video/mp4');
      return new File([blob], job.fileName.replace(/\.[^.]+$/, '') + '.mp4', { type: 'video/mp4' });
    }
    throw new MediaUploadError('unsupported_media', 'No encontramos el archivo del vídeo.');
  }

  private async uploadVideo(job: UploadJob, signal: AbortSignal): Promise<string> {
    const provider = this.deps.provider();
    const prepared = job.prepared!;
    let session: R2Session | null = null;

    if (!job.provider || (job.provider === 'r2' && !job.r2)) {
      // Without a measured duration R2 cannot check the 45 s limit, and it only
      // takes mp4/mov/webm: otherwise Cloudinary does the job.
      const start = prepared.durationSeconds > 0 && isR2VideoType(prepared.contentType)
        ? await provider.startVideo({
          eventId: job.eventId,
          purpose: 'user',
          contentType: prepared.contentType,
          sizeBytes: prepared.sizeBytes,
          durationSeconds: prepared.durationSeconds,
        }, signal)
        : { provider: 'cloudinary' as const };
      if (start.provider === 'cloudinary') {
        job = this.patch(job.id, { provider: 'cloudinary' }, true)!;
      } else {
        session = start;
        job = this.patch(job.id, {
          provider: 'r2',
          r2: {
            reservationId: start.reservationId,
            key: start.key,
            completedParts: [],
            bodyUploaded: false,
            posterDone: false,
            thumbnailReservationId: null,
          },
        }, true)!;
      }
    }

    if (job.provider === 'cloudinary') {
      if (job.cloudinaryReservationId) return this.deps.waitForAsset(job.cloudinaryReservationId, 'video');
      const file = await this.videoFile(job);
      const result = await provider.uploadToCloudinary({
        file,
        kind: 'video',
        eventId: job.eventId,
        purpose: 'user',
        signal,
        onProgress: (progress) => this.patch(job.id, { loadedBytes: progress.loadedBytes, totalBytes: progress.totalBytes }),
      });
      this.patch(job.id, { cloudinaryReservationId: result.reservationId }, true);
    return this.deps.waitForAsset(result.reservationId, 'video');
    }

    // R2: upload the missing parts, then the poster, then confirm.
    const r2 = job.r2!;
    const source: UploadSource = prepared.path
      ? { type: 'native', path: prepared.path }
      : { type: 'blob', blob: job.file! };
    let parts = r2.completedParts;
    const alreadyUploaded = r2.bodyUploaded || await (async () => {
      if (session) return false;
      try {
        session = await provider.client.resume(r2.reservationId, signal);
        return false;
      } catch (error) {
        // 409 "already completed": the asset exists, complete() returns it.
        if (isMediaUploadError(error) && error.status === 409 && /completed/i.test(error.message)) return true;
        throw error;
      }
    })();

    if (!alreadyUploaded && session) {
      parts = await uploadSessionParts({
        client: provider.client,
        session,
        source,
        totalBytes: prepared.sizeBytes,
        completedParts: r2.completedParts,
        taskId: job.id,
        signal,
        onProgress: (loaded) => this.patch(job.id, { loadedBytes: loaded, totalBytes: prepared.sizeBytes }),
        onPartDone: async (part) => {
          const current = this.get(job.id);
          if (!current?.r2) return;
          this.patch(job.id, {
            r2: { ...current.r2, completedParts: [...current.r2.completedParts.filter((p) => p.partNumber !== part.partNumber), part] },
          }, true);
        },
      });
      const uploaded = this.get(job.id);
      if (uploaded?.r2) this.patch(job.id, { r2: { ...uploaded.r2, bodyUploaded: true } }, true);
    }

    let current = this.get(job.id)!;
    if (!current.r2!.posterDone) {
      this.patch(job.id, { status: 'finalizing' });
      const poster = prepared.thumbnailPath
        ? await readNativeFile(prepared.thumbnailPath, 'image/jpeg').catch(() => null)
        : job.file ? await extractVideoThumbnail(job.file) : null;
      const thumbnailReservationId = await provider.uploadPoster(poster, signal);
      current = this.patch(job.id, { r2: { ...current.r2!, posterDone: true, thumbnailReservationId } }, true)!;
    }

    const isMultipart = session ? (session as R2Session).upload.type === 'multipart' : parts.length > 0;
    const completed = await provider.client.complete({
      reservationId: r2.reservationId,
      parts: isMultipart ? parts : undefined,
      durationSeconds: prepared.durationSeconds,
      width: prepared.width,
      height: prepared.height,
      thumbnailReservationId: current.r2!.thumbnailReservationId,
    }, signal);
    return completed.mediaAssetId;
  }
}

// ---------------------------------------------------------------------------
// Singleton wired to Supabase

const defaultDeps: QueueDeps = {
  provider: getConfiguredMediaProvider,
  currentUserId: async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  },
  waitForAsset: (reservationId, kind) =>
    // Cloudinary assets appear when its webhook arrives; videos take longer.
    waitForMediaAssetId(reservationId, kind === 'video'
      ? { attempts: 120, intervalMs: 1_000 }
      : { attempts: 40, intervalMs: 500 }),
  resolveSongId: async (setlistItemId) => {
    const { data, error } = await supabase
      .from('event_setlist_items')
      .select('song_id')
      .eq('id', setlistItemId)
      .maybeSingle();
    if (error) throw error;
    return (data?.song_id as string | null | undefined) ?? null;
  },
  createPost: async (input) => {
    const row = {
      author_id: input.authorId,
      media_asset_id: input.mediaAssetId,
      event_id: input.eventId,
      captured_at: input.capturedAt,
      caption: input.caption,
      song_id: input.songId,
      // Only sent when off: the column defaults to true.
      ...(input.allowReuse ? {} : { allow_reuse: false }),
    };
    // posts_create requires source = 'upload' for uploads (social import
    // migration). Before that migration the column does not exist: retry
    // without it.
    let { data, error } = await supabase.from('posts').insert({ ...row, source: 'upload' }).select('id').single();
    if (error && (error.code === 'PGRST204' || error.code === '42703') && /source/.test(error.message)) {
      ({ data, error } = await supabase.from('posts').insert(row).select('id').single());
    }
    if (error) {
      // A retry after a lost response: the post already exists.
      if (error.code === '23505') {
        const { data: existing, error: lookupError } = await supabase
          .from('posts')
          .select('id')
          .eq('media_asset_id', input.mediaAssetId)
          .maybeSingle();
        if (lookupError) throw lookupError;
        if (existing?.id) return existing.id as string;
      }
      throw error;
    }
    return data!.id as string;
  },
};

let queue: UploadQueue | null = null;

export const getUploadQueue = () => {
  if (!queue) queue = new UploadQueue(defaultDeps);
  return queue;
};

/**
 * Queue concert moments for upload and return their job ids immediately. The
 * queue compresses, uploads, retries and creates the posts in the background;
 * follow it with useUploadQueue() or <UploadProgressPill />.
 *
 * - Web: pass `file` (photos ≤ 10 MB, videos ≤ 75 MB and ≤ 45 s).
 * - App: pass `nativePath` from pickMomentVideos() so the video is compressed
 *   on the device; photos and <input type="file"> picks can pass `file`.
 */
export const enqueueMomentUploads = (items: MomentUploadItem[]) => getUploadQueue().enqueue(items);
