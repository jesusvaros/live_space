import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/**
 * TypeScript side of the app-local Capacitor plugin `LiveSpaceMedia`:
 * android/app/src/main/java/com/livespace/app/media/LiveSpaceMediaPlugin.java
 * and ios/App/App/LiveSpaceMediaPlugin.swift. There is no web implementation;
 * check isNativeMediaAvailable() first.
 */

export type CaptureLocation = { latitude: number; longitude: number };

export type NativeVideoInfo = {
  /** Absolute file path (iOS, copies of picked videos) or content:// URI (Android). */
  path: string;
  durationSeconds: number;
  width: number;
  height: number;
  /** -1 when the platform does not report it. */
  sizeBytes: number;
  /** Creation date from the QuickTime/MP4 metadata, ISO-8601, or null. */
  capturedAt: string | null;
  /**
   * GPS from the file metadata, or null. Android's photo picker and iOS may
   * redact it; it never goes into the compressed file.
   */
  location: CaptureLocation | null;
};

export type CompressVideoOptions = {
  path: string;
  /** Correlates compressProgress events. */
  taskId?: string;
  maxDurationSeconds?: number;
  maxLongSide?: number;
  maxShortSide?: number;
  videoBitrate?: number;
  audioBitrate?: number;
};

export type CompressedVideo = {
  /** H.264/AAC faststart MP4 in the app's private upload folder. */
  path: string;
  /** JPEG poster frame next to it, or null when the frame could not be read. */
  thumbnailPath: string | null;
  sizeBytes: number;
  durationSeconds: number;
  width: number;
  height: number;
  /** True when the source was longer than maxDurationSeconds and was cut. */
  trimmed: boolean;
  contentType: 'video/mp4';
  /** Capture metadata of the source; the output file carries none. */
  capturedAt: string | null;
  location: CaptureLocation | null;
};

export type UploadFileRangeOptions = {
  taskId?: string;
  path: string;
  /** Presigned https URL. */
  url: string;
  offset: number;
  length: number;
  headers?: Record<string, string>;
};

export type UploadFileRangeResult = { status: number; etag: string | null };

export interface LiveSpaceMediaPlugin {
  /** System picker for videos (no photo-library permission needed). */
  pickVideos(options?: { limit?: number }): Promise<{ videos: NativeVideoInfo[] }>;
  getVideoInfo(options: { path: string }): Promise<NativeVideoInfo>;
  compressVideo(options: CompressVideoOptions): Promise<CompressedVideo>;
  /** PUT a byte range of a local file, streamed from disk on a native thread. */
  uploadFileRange(options: UploadFileRangeOptions): Promise<UploadFileRangeResult>;
  /** Deletes a file inside the plugin's upload folder; anything else is ignored. */
  deleteFile(options: { path: string }): Promise<void>;
  addListener(
    eventName: 'compressProgress',
    listener: (event: { taskId: string; progress: number }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'uploadProgress',
    listener: (event: { taskId: string; sentBytes: number; totalBytes: number }) => void,
  ): Promise<PluginListenerHandle>;
}

export const LiveSpaceMedia = registerPlugin<LiveSpaceMediaPlugin>('LiveSpaceMedia');

/** The plugin ships inside both native apps, so any native platform has it. */
export const isNativeMediaAvailable = () => Capacitor.isNativePlatform();
