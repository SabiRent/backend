import type { StorageProvider } from '@/constants/storage';

/** Provider-agnostic payload handed to an adapter for a single upload. */
export interface UploadFileInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
  /** Logical grouping/context, e.g. `property-photos`, `tenant-documents`. */
  folder?: string;
  /** Private files are stored so they require a signed, time-limited URL. */
  isPrivate?: boolean;
}

/** Provider-agnostic result of an upload. */
export interface UploadFileResult {
  /** Provider's own identifier for the stored object (e.g. Cloudinary public_id). */
  providerFileId: string;
  /** Directly usable URL (public files). Private files still need a signed URL. */
  url: string;
  /**
   * Opaque provider-specific bits needed later to sign or delete the object
   * (e.g. Cloudinary resource/delivery type). Persisted on the File record.
   */
  metadata?: Record<string, unknown>;
}

export interface SignedUrlOptions {
  /** Lifetime of the signed URL in seconds. Falls back to SIGNED_URL_EXPIRES_IN. */
  expiresInSeconds?: number;
  /** Provider hint carried over from upload metadata (e.g. `image`, `video`, `raw`). */
  resourceType?: string;
}

export interface PublicUrlOptions {
  /** Provider hint carried over from upload metadata (e.g. `image`, `video`, `raw`). */
  resourceType?: string;
  /** File extension/format so the delivery URL matches the stored asset. */
  format?: string;
}

export interface DeleteFileOptions {
  resourceType?: string;
  /** Provider delivery type, e.g. Cloudinary `upload` vs `authenticated`. */
  deliveryType?: string;
}

/**
 * The seam that decouples callers from the storage backend. Swapping Cloudinary
 * for S3/R2 means adding a new implementation and registering it in the factory —
 * no caller changes.
 */
export interface StorageAdapter {
  readonly provider: StorageProvider;
  upload(input: UploadFileInput): Promise<UploadFileResult>;
  /** Plain, directly-servable URL for a public file. */
  getPublicUrl(providerFileId: string, options?: PublicUrlOptions): string;
  /** Signed, time-limited URL for a private file. */
  getSignedUrl(providerFileId: string, options?: SignedUrlOptions): Promise<string>;
  delete(providerFileId: string, options?: DeleteFileOptions): Promise<void>;
}
