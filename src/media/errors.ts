export type MediaUploadErrorCode =
  | 'authentication_required'
  | 'authorization_failed'
  | 'invalid_authorization'
  | 'authorization_expired'
  | 'file_too_large'
  | 'upload_failed'
  | 'invalid_upload_response'
  | 'aborted';

export class MediaUploadError extends Error {
  readonly code: MediaUploadErrorCode;
  readonly status: number | null;
  readonly cause: unknown;

  constructor(code: MediaUploadErrorCode, message: string, options?: { status?: number; cause?: unknown }) {
    super(message);
    this.name = 'MediaUploadError';
    this.code = code;
    this.status = options?.status ?? null;
    this.cause = options?.cause;
  }
}

export const isMediaUploadError = (error: unknown): error is MediaUploadError =>
  error instanceof MediaUploadError;
