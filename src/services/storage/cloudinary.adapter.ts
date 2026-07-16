import cloudinary from '@/config/cloudinary.config';
import { SIGNED_URL_EXPIRES_IN } from '@/config/env.config';
import { StorageProvider } from '@/constants/storage';
import AppError from '@/errors/AppError';
import type {
  DeleteFileOptions,
  SignedUrlOptions,
  StorageAdapter,
  UploadFileInput,
  UploadFileResult,
} from '@/types/storage.types';
import type { UploadApiResponse } from 'cloudinary';
import { StatusCodes } from 'http-status-codes';

/**
 * Cloudinary implementation of the StorageAdapter seam.
 *
 * Private files are stored with delivery type `authenticated`, which makes the
 * object undeliverable without a signed URL — so {@link getSignedUrl} is the
 * only way to read them, and those URLs carry an `expires_at` for time-limited
 * access. Public files use the plain `upload` delivery type and are served from
 * their `secure_url` directly.
 */
export class CloudinaryAdapter implements StorageAdapter {
  readonly provider = StorageProvider.CLOUDINARY;

  async upload(input: UploadFileInput): Promise<UploadFileResult> {
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: input.folder,
          resource_type: 'auto',
          type: input.isPrivate ? 'authenticated' : 'upload',
        },
        (error, uploaded) => {
          if (error || !uploaded) {
            reject(error ?? AppError('File upload failed', StatusCodes.BAD_GATEWAY));
            return;
          }
          resolve(uploaded);
        },
      );
      stream.end(input.buffer);
    });

    return {
      providerFileId: result.public_id,
      url: result.secure_url,
      metadata: {
        resourceType: result.resource_type,
        deliveryType: result.type,
        format: result.format,
        bytes: result.bytes,
      },
    };
  }

  async getSignedUrl(providerFileId: string, options: SignedUrlOptions = {}): Promise<string> {
    const expiresIn = options.expiresInSeconds ?? SIGNED_URL_EXPIRES_IN;

    return cloudinary.url(providerFileId, {
      resource_type: options.resourceType ?? 'image',
      type: 'authenticated',
      secure: true,
      sign_url: true,
      expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    });
  }

  async delete(providerFileId: string, options: DeleteFileOptions = {}): Promise<void> {
    await cloudinary.uploader.destroy(providerFileId, {
      resource_type: options.resourceType ?? 'image',
      type: options.deliveryType ?? 'upload',
      invalidate: true,
    });
  }
}
