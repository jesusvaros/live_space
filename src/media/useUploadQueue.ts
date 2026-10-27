import { useMemo, useSyncExternalStore } from 'react';
import { getUploadQueue, type UploadJob, type UploadQueueSnapshot } from './uploadQueue';

export type UploadQueueState = 'idle' | 'working' | 'waiting_wifi' | 'waiting_network' | 'error' | 'done';

export type UploadQueueSummary = {
  state: UploadQueueState;
  total: number;
  done: number;
  failed: number;
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
  const failed = jobs.filter((job) => job.status === 'failed').length;
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
    clearFinished: queue.clearFinished.bind(queue),
    setWifiOnly: queue.setWifiOnly.bind(queue),
  }), [queue]);
  return { ...snapshot, summary, ...actions };
};
