export type MediaKind = 'image' | 'video';

export type MediaUploadPurpose = 'user' | 'professional' | 'catalog';

export type MediaUploadProgress = {
  loadedBytes: number;
  totalBytes: number;
  percent: number;
};

export type MediaUploadRequest = {
  file: File;
  kind?: MediaKind;
  eventId?: string | null;
  subjectId?: string | null;
  purpose?: MediaUploadPurpose;
  signal?: AbortSignal;
  onProgress?: (progress: MediaUploadProgress) => void;
};

export type MediaUploadResult = {
  provider: 'cloudinary';
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
};

/**
 * Domain-facing media contract. Callers do not need to know which media vendor
 * stores the asset, which keeps a future migration away from Cloudinary local.
 */
export interface MediaProvider {
  upload(request: MediaUploadRequest): Promise<MediaUploadResult>;
}
