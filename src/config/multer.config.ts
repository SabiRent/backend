import { MAX_FILE_SIZE_MB } from '@/config/env.config';
import multer from 'multer';

/**
 * In-memory upload — keeps the raw buffer on `req.file(s)` so the storage
 * adapter can stream it straight to the active provider without touching disk.
 * Route handlers apply this middleware, e.g. `memoryUpload.single('file')`.
 */
export const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
});
