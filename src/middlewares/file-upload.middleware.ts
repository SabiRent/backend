import { MAX_FILE_SIZE_MB } from '@/config/env.config';
import { ErrorCode } from '@/constants/error-code';
import { ERROR_MESSAGE } from '@/constants/message';
import type { MimeType } from '@/constants/mime-type';
import AppError from '@/errors/AppError';
import type { Request } from 'express';
import { StatusCodes } from 'http-status-codes';
import multer, { type FileFilterCallback } from 'multer';

/**
 * Rejects any upload whose MIME type is not in the allow-list. Using AppError
 * (not a bare Error) so the rejection flows through the app's error handler as
 * a proper 415 instead of a generic 500.
 */
const createFileFilter =
  (allowed: readonly string[]) =>
  (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(
      AppError(
        `${ERROR_MESSAGE.INVALID_FILE_TYPE}. Allowed: ${allowed.join(', ')}`,
        StatusCodes.UNSUPPORTED_MEDIA_TYPE,
        ErrorCode.INVALID_FILE_TYPE,
      ),
    );
  };

/**
 * Builds an in-memory multer upload middleware restricted to the given MIME
 * types. The raw buffer is kept on `req.file(s)` so the storage service can
 * stream it straight to the provider without touching disk.
 *
 * Usage: `fileUploadFor([MimeType.PNG, MimeType.JPEG], 2).single('avatar')`
 */
export const fileUploadFor = (allowed: readonly MimeType[], maxSizeMB = MAX_FILE_SIZE_MB) =>
  multer({
    storage: multer.memoryStorage(),
    fileFilter: createFileFilter(allowed),
    limits: { fileSize: maxSizeMB * 1024 * 1024 },
  });
