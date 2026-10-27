export type MediaKind = 'image' | 'video';

export type MediaUploadPurpose = 'user' | 'professional' | 'catalog';

export type MediaUploadProgress = {
  loadedBytes: number;
  totalBytes: number;
  percent: number;
};

export type MediaStorageProvider = 'cloudinary' | 'r2';

export type MediaUploadRequest = {
  file: File;
  kind?: MediaKind;
  eventId?: string | null;
  subjectId?: string | null;
  purpose?: MediaUploadPurpose;
  signal?: AbortSignal;
  onProgress?: (progress: MediaUploadProgress) => void;
  /** Videos only. R2 cannot probe files, so the client reports what it measured. */
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  /** Poster frame for an R2 video; uploaded through the Cloudinary image path. */
  thumbnail?: Blob | null;
};

export type MediaUploadResult = {
  provider: MediaStorageProvider;
  reservationId: string;
  publicId: string;
  resourceType: MediaKind;
  secureUrl: string;
  version: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  bytes: number;
  format: string | null;
  /** Set when the provider creates the media asset synchronously (R2). */
  mediaAssetId?: string | null;
};

/**
 * Domain-facing media contract. Callers do not need to know which media vendor
 * stores the asset: Cloudinary (images, and videos by default) or Cloudflare R2.
 */
export interface MediaProvider {
  upload(request: MediaUploadRequest): Promise<MediaUploadResult>;
}
