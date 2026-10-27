export { CloudinaryMediaProvider, createCloudinaryMediaProvider } from './cloudinary';
export {
  createConfiguredCloudinaryMediaProvider,
  createConfiguredMediaProvider,
  createConfiguredR2Client,
  getConfiguredMediaProvider,
} from './configured';
export { uploadEventPost, waitForMediaAssetId } from './uploadPost';
export type { CloudinaryMediaProviderOptions } from './cloudinary';
export { isMediaUploadError, MediaUploadError } from './errors';
export type { MediaUploadErrorCode } from './errors';
export { IMAGE_MAX_BYTES, VIDEO_COMPRESSION, VIDEO_MAX_BYTES, VIDEO_MAX_DURATION_SECONDS } from './limits';
export { R2MediaClient, R2MediaProvider } from './r2';
export type { R2Session, R2StartResult, R2UploadPlan } from './r2';
export { compressMomentVideo, isNativeMediaAvailable, pickMomentVideos } from './native';
export type { CaptureLocation, CompressedVideo, NativeVideoInfo } from './native';
export { enqueueMomentUploads, getUploadQueue, UploadQueue } from './uploadQueue';
export type { MomentUploadItem, UploadJob, UploadJobStatus, UploadQueueSnapshot } from './uploadQueue';
export { summarizeUploads, useUploadQueue } from './useUploadQueue';
export type { UploadQueueState, UploadQueueSummary } from './useUploadQueue';
export type {
  MediaKind,
  MediaProvider,
  MediaStorageProvider,
  MediaUploadProgress,
  MediaUploadPurpose,
  MediaUploadRequest,
  MediaUploadResult,
} from './types';
