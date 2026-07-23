import AppError from '@/errors/AppError';
import { StatusCodes } from 'http-status-codes';
import multer, { type FileFilterCallback } from 'multer';
import type { Request } from 'express';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Files stay in memory as a Buffer (req.file.buffer) instead of being written to disk —
// we forward that buffer straight to Cloudinary, so the server never needs its own copy.
const storage = multer.memoryStorage();

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(
      AppError(
        `Unsupported file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
        StatusCodes.BAD_REQUEST,
      ),
    );
    return;
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadPropertyImage = upload.single('image');
