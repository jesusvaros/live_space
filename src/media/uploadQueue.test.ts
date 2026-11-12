import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  available: false,
  compressMomentVideo: vi.fn(),
  deleteNativeFile: vi.fn(async () => undefined),
  readNativeFile: vi.fn(),
}));

vi.mock('@capacitor/network', () => ({
  Network: {
    getStatus: async () => ({ connected: true, connectionType: 'wifi' }),
    addListener: async () => ({ remove: async () => undefined }),
  },
}));
vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('./configured', () => ({ getConfiguredMediaProvider: () => { throw new Error('not in tests'); } }));
vi.mock('./uploadQueueStore', () => ({
  loadStoredJobs: async () => [],
  saveStoredJob: async () => undefined,
  deleteStoredJob: async () => undefined,
}));
vi.mock('./videoProbe', () => ({
  probeVideo: async () => ({ durationSeconds: 20, width: 1280, height: 720 }),
  extractVideoThumbnail: async () => null,
}));
vi.mock('./native', () => ({
  isNativeMediaAvailable: () => native.available,
  compressMomentVideo: native.compressMomentVideo,
  deleteNativeFile: native.deleteNativeFile,
  readNativeFile: native.readNativeFile,
  LiveSpaceMedia: { getVideoInfo: vi.fn() },
}));

import { MediaUploadError } from './errors';
import { UploadQueue, type UploadJob } from './uploadQueue';
import { summarizeUploads } from './useUploadQueue';

const MB = 1_000_000;

const fileOfSize = (name: string, type: string, size: number) => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

const makeQueue = (overrides: {
  uploadToCloudinary?: () => Promise<{ reservationId: string }>;
  track?: (name: string, props: Record<string, unknown>) => void;
} = {}) => {
  const uploadToCloudinary = vi.fn(overrides.uploadToCloudinary ?? (async () => ({ reservationId: 'res-1' })));
  const provider = {
    startVideo: vi.fn(async () => ({ provider: 'cloudinary' as const })),
    uploadToCloudinary,
    uploadPoster: vi.fn(),
    client: { abort: vi.fn(async () => undefined) },
  };
  const queue = new UploadQueue({
    provider: () => provider as never,
    currentUserId: async () => 'user-1',
    acceptTerms: async () => undefined,
    waitForAsset: async () => 'asset-1',
    resolveSongId: async () => null,
    createPost: async () => 'post-1',
    track: overrides.track,
  });
  return { queue, provider };
};

const jobOf = (queue: UploadQueue, id: string) => queue.getSnapshot().jobs.find((job) => job.id === id) as UploadJob;

const settled = async (queue: UploadQueue, id: string, statuses: UploadJob['status'][]) => {
  await vi.waitFor(() => expect(statuses).toContain(jobOf(queue, id)?.status));
  return jobOf(queue, id);
};

beforeEach(() => {
  native.available = false;
  native.compressMomentVideo.mockReset();
  native.deleteNativeFile.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('UploadQueue limits', () => {
  it('fails a too-big web video for good, says how big, and «Reintentar» leaves it alone', async () => {
    const { queue } = makeQueue();
    const [id] = await queue.enqueue([{ file: fileOfSize('concierto.mp4', 'video/mp4', 120 * MB), eventId: 'event-1' }]);

    const job = await settled(queue, id, ['failed']);
    expect(job.permanent).toBe(true);
    expect(job.error).toBe('Este vídeo es demasiado grande (pesa 120 MB). El máximo es 75 MB.');

    queue.retryAll();
    queue.retry(id);
    expect(jobOf(queue, id).status).toBe('failed');

    const summary = summarizeUploads(queue.getSnapshot());
    expect(summary).toMatchObject({ state: 'error', failed: 1, retryable: 0, errorMessage: job.error });

    await queue.clearFailed();
    expect(queue.getSnapshot().jobs).toHaveLength(0);
  });

  it('fails a too-big photo for good', async () => {
    const { queue } = makeQueue();
    const [id] = await queue.enqueue([{ file: fileOfSize('foto.jpg', 'image/jpeg', 14 * MB), eventId: 'event-1' }]);
    const job = await settled(queue, id, ['failed']);
    expect(job).toMatchObject({ permanent: true, error: 'Esta foto es demasiado grande (pesa 14 MB). El máximo es 10 MB.' });
  });

  it('compresses a native video first and checks 75 MB on the compressed file', async () => {
    native.available = true;
    native.compressMomentVideo.mockResolvedValue({
      path: '/data/ls-uploads/out.mp4',
      thumbnailPath: '/data/ls-uploads/out.jpg',
      sizeBytes: 18 * MB,
      durationSeconds: 30,
      width: 1280,
      height: 720,
      trimmed: false,
      contentType: 'video/mp4',
      capturedAt: '2026-11-10T21:00:00.000Z',
      location: null,
    });
    native.readNativeFile.mockResolvedValue(new Blob(['x'], { type: 'video/mp4' }));
    const { queue, provider } = makeQueue();

    const [id] = await queue.enqueue([{ nativePath: 'content://media/picker/0/video/42', kind: 'video', eventId: 'event-1' }]);
    const job = await settled(queue, id, ['done', 'failed']);

    expect(job.status).toBe('done');
    expect(native.compressMomentVideo).toHaveBeenCalledWith('content://media/picker/0/video/42', expect.objectContaining({ taskId: id }));
    expect(provider.startVideo).toHaveBeenCalledWith(expect.objectContaining({ sizeBytes: 18 * MB, contentType: 'video/mp4' }), expect.anything());
    expect(job.capturedAt).toBe('2026-11-10T21:00:00.000Z');
  });

  it('fails for good when even the compressed video is over 75 MB', async () => {
    native.available = true;
    native.compressMomentVideo.mockResolvedValue({
      path: '/data/ls-uploads/out.mp4',
      thumbnailPath: null,
      sizeBytes: 80 * MB,
      durationSeconds: 45,
      width: 1280,
      height: 720,
      trimmed: true,
      contentType: 'video/mp4',
      capturedAt: null,
      location: null,
    });
    const { queue } = makeQueue();
    const [id] = await queue.enqueue([{ nativePath: '/private/src-1.mov', kind: 'video', eventId: 'event-1' }]);
    const job = await settled(queue, id, ['failed']);
    expect(job.permanent).toBe(true);
    expect(job.error).toMatch(/comprimido sigue pesando 80 MB/);
    expect(native.deleteNativeFile).toHaveBeenCalledWith('/data/ls-uploads/out.mp4');
  });

  it('keeps network failures retryable', async () => {
    const { queue } = makeQueue({
      uploadToCloudinary: async () => {
        throw new MediaUploadError('upload_failed', 'Bad gateway', { status: 502 });
      },
    });
    const [id] = await queue.enqueue([{ file: fileOfSize('foto.jpg', 'image/jpeg', 2 * MB), eventId: 'event-1' }]);
    const job = await settled(queue, id, ['retrying']);
    expect(job.permanent).toBeFalsy();
    expect(job.attempts).toBe(1);
  });
});

describe('UploadQueue usage events', () => {
  const PRIVATE = /concierto|foto|IMG|event-1|user-1|post-1|asset-1|res-1/;
  const noPrivateData = (track: ReturnType<typeof vi.fn>) => {
    for (const [, props] of track.mock.calls) expect(JSON.stringify(props)).not.toMatch(PRIVATE);
  };

  it('start → done, with kind, size and time but no names or ids', async () => {
    const track = vi.fn();
    const { queue } = makeQueue({ track });
    const [id] = await queue.enqueue([{ file: fileOfSize('foto.jpg', 'image/jpeg', 2 * MB), eventId: 'event-1' }]);
    await settled(queue, id, ['done']);
    await vi.waitFor(() => expect(track).toHaveBeenCalledWith('upload_done', expect.anything()));
    expect(track.mock.calls.map(([name]) => name)).toEqual(['upload_start', 'upload_done']);
    expect(track).toHaveBeenCalledWith('upload_start', { kind: 'image', bytes: 2 * MB, native: false });
    expect(track).toHaveBeenCalledWith('upload_done', expect.objectContaining({ kind: 'image', attempts: 1, bytes: 2 * MB, ms: expect.any(Number) }));
    noPrivateData(track);
  });

  it('a network failure → upload_retry with the reason and the status', async () => {
    const track = vi.fn();
    const { queue } = makeQueue({
      track,
      uploadToCloudinary: async () => {
        throw new MediaUploadError('upload_failed', 'Bad gateway for foto.jpg', { status: 502 });
      },
    });
    const [id] = await queue.enqueue([{ file: fileOfSize('foto.jpg', 'image/jpeg', 2 * MB), eventId: 'event-1' }]);
    await settled(queue, id, ['retrying']);
    expect(track).toHaveBeenCalledWith('upload_retry', expect.objectContaining({ kind: 'image', reason: 'upload_failed', status: 502, attempts: 1 }));
    expect(track).not.toHaveBeenCalledWith('upload_failed', expect.anything());
    noPrivateData(track);
  });

  it('a permanent failure → upload_failed { permanent: true }, and «Reintentar» counts nothing', async () => {
    const track = vi.fn();
    const { queue } = makeQueue({ track });
    const [id] = await queue.enqueue([{ file: fileOfSize('concierto.mp4', 'video/mp4', 120 * MB), eventId: 'event-1' }]);
    await settled(queue, id, ['failed']);
    expect(track).toHaveBeenCalledWith('upload_failed', expect.objectContaining({
      kind: 'video',
      reason: 'file_too_large',
      attempts: 1,
      permanent: true,
      bytes: 120 * MB,
    }));
    queue.retry(id);
    expect(track).not.toHaveBeenCalledWith('upload_retry', expect.anything());
    noPrivateData(track);
  });

  it('a failing tracker never breaks an upload', async () => {
    const { queue } = makeQueue({ track: () => { throw new Error('analytics down'); } });
    const [id] = await queue.enqueue([{ file: fileOfSize('foto.jpg', 'image/jpeg', 2 * MB), eventId: 'event-1' }]);
    expect((await settled(queue, id, ['done', 'failed'])).status).toBe('done');
  });
});
