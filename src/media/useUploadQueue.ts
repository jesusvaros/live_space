import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { getUploadQueue, isRetryableFailure, type UploadJob, type UploadQueueSnapshot } from './uploadQueue';

export type UploadQueueState = 'idle' | 'working' | 'waiting_wifi' | 'waiting_network' | 'error' | 'done';

export type UploadQueueSummary = {
  state: UploadQueueState;
  total: number;
  done: number;
  failed: number;
  /** Failed jobs «Reintentar» can fix; the rest (too big, too long…) can only be removed. */
  retryable: number;
  /**
   * What went wrong, in Spanish, when every failed job failed the same way
   * (e.g. «Este vídeo es demasiado grande (pesa 120 MB)…»); null otherwise.
   */
  errorMessage: string | null;
  pending: number;
  /** 1-based position of the job being worked on, among the non-failed ones. */
  current: number;
  /** 0..100 across all non-failed jobs (compression counts as the first 10 %). */
  percent: number;
  compressing: boolean;
};

const jobFraction = (job: UploadJob) => {
  switch (job.status) {
    case 'done':
      return 1;
    case 'compressing':
      return 0.1 * job.compressProgress;
    case 'finalizing':
      return 0.95;
    default: {
      const base = job.kind === 'video' && job.prepared?.path ? 0.1 : 0;
      const uploaded = job.totalBytes > 0 ? Math.min(1, job.loadedBytes / job.totalBytes) : 0;
      return base + (0.95 - base) * uploaded;
    }
  }
};

export const summarizeUploads = (snapshot: UploadQueueSnapshot): UploadQueueSummary => {
  const { jobs } = snapshot;
  const done = jobs.filter((job) => job.status === 'done').length;
  const failedJobs = jobs.filter((job) => job.status === 'failed');
  const failed = failedJobs.length;
  const messages = new Set(failedJobs.map((job) => job.error ?? ''));
  const errorMessage = messages.size === 1 ? [...messages][0] || null : null;
  const live = jobs.filter((job) => job.status !== 'failed');
  const pending = live.length - done;
  const percent = live.length > 0
    ? Math.round((live.reduce((sum, job) => sum + jobFraction(job), 0) / live.length) * 100)
    : 0;
  const waitingWifi = jobs.some((job) => job.status === 'waiting_wifi');
  const waitingNetwork = jobs.some((job) => job.status === 'waiting_network');
  let state: UploadQueueState = 'idle';
  if (jobs.length === 0) state = 'idle';
  else if (pending > 0 && waitingNetwork) state = 'waiting_network';
  else if (pending > 0 && waitingWifi) state = 'waiting_wifi';
  else if (pending > 0) state = 'working';
  else if (failed > 0) state = 'error';
  else state = 'done';
  return {
    state,
    total: jobs.length,
    done,
    failed,
    retryable: failedJobs.filter(isRetryableFailure).length,
    errorMessage,
    pending,
    current: Math.min(live.length, done + 1),
    percent,
    compressing: jobs.some((job) => job.status === 'compressing'),
  };
};

/**
 * Live view of the upload queue for progress UI. Mounting it also restores the
 * jobs saved before an app restart and resumes them.
 */
export const useUploadQueue = () => {
  const queue = getUploadQueue();
  const snapshot = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  const summary = useMemo(() => summarizeUploads(snapshot), [snapshot]);
  // Stable callbacks: safe in effect dependencies.
  const actions = useMemo(() => ({
    enqueue: queue.enqueue.bind(queue),
    retry: queue.retry.bind(queue),
    retryAll: queue.retryAll.bind(queue),
    remove: queue.remove.bind(queue),
    clearFailed: queue.clearFailed.bind(queue),
    clearFinished: queue.clearFinished.bind(queue),
    setWifiOnly: queue.setWifiOnly.bind(queue),
  }), [queue]);
  return { ...snapshot, summary, ...actions };
};

/** The queue as seen from one concert: only the jobs going to that event. */
export const useEventUploads = (eventId: string | null | undefined) => {
  const queue = useUploadQueue();
  const { jobs, retryAll, remove } = queue;
  const eventJobs = useMemo(() => (eventId ? jobs.filter((job) => job.eventId === eventId) : []), [jobs, eventId]);
  const summary = useMemo(() => summarizeUploads({ ...queue, jobs: eventJobs }), [queue, eventJobs]);
  // «Quitar» for this concert's uploads that cannot succeed (too big…).
  const clearFailed = useCallback(
    () => Promise.all(eventJobs.filter((job) => job.status === 'failed' && job.permanent).map((job) => remove(job.id))),
    [eventJobs, remove],
  );
  return { summary, retryAll, clearFailed };
};
