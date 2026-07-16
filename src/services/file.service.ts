import { ErrorCode } from '@/constants/error-code';
import { FileVisibility } from '@/constants/storage';
import FileModel, { type FileDocument } from '@/db/models/file.model';
import AppError from '@/errors/AppError';
import { getStorageAdapter } from '@/services/storage';
import { StatusCodes } from 'http-status-codes';

export interface UploadFileParams {
  file: Express.Multer.File;
  /** Logical grouping/context, e.g. `property-photos`, `tenant-documents`. */
  folder?: string;
  /** Store as private → access is only ever via signed, time-limited URLs. */
  isPrivate?: boolean;
  /** Optional polymorphic association to the owning resource. */
  resourceType?: string;
  resourceId?: string;
}

export interface StoredFile {
  file: FileDocument;
  /** Ready-to-use URL: the public URL, or a signed URL for private files. */
  accessUrl: string;
}

/**
 * Returns a usable URL for a file: the stored URL for public files, or a fresh
 * signed/time-limited URL for private ones. Never persist the signed URL — it
 * expires; always resolve on read.
 */
const resolveAccessUrl = async (file: FileDocument): Promise<string> => {
  if (file.visibility === FileVisibility.PUBLIC) return file.url;

  const adapter = getStorageAdapter();
  const meta = (file.metadata ?? {}) as Record<string, unknown>;

  return adapter.getSignedUrl(file.providerFileId, {
    resourceType: typeof meta.resourceType === 'string' ? meta.resourceType : undefined,
  });
};

/**
 * Uploads a multer file through the active storage provider and records it in
 * the File collection. Generic across contexts — pass `folder`/`resourceType`
 * to scope it (property photos today, tenant documents later).
 */
export const uploadFile = async (params: UploadFileParams): Promise<StoredFile> => {
  const { file, folder, isPrivate = false, resourceType, resourceId } = params;

  if (!file) {
    throw AppError('No file provided', StatusCodes.BAD_REQUEST, ErrorCode.INVALID_INPUT);
  }

  const adapter = getStorageAdapter();
  const uploaded = await adapter.upload({
    buffer: file.buffer,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    folder,
    isPrivate,
  });

  const record = await FileModel.create({
    provider: adapter.provider,
    providerFileId: uploaded.providerFileId,
    url: uploaded.url,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    visibility: isPrivate ? FileVisibility.PRIVATE : FileVisibility.PUBLIC,
    folder,
    resourceType,
    resourceId,
    metadata: uploaded.metadata,
  });

  return { file: record, accessUrl: await resolveAccessUrl(record) };
};

/** Resolves a fresh access URL for a stored file by id. */
export const getFileAccessUrl = async (fileId: string): Promise<string> => {
  const file = await FileModel.findById(fileId);
  if (!file) {
    throw AppError('File not found', StatusCodes.NOT_FOUND, ErrorCode.RESOURCE_NOT_FOUND);
  }
  return resolveAccessUrl(file);
};

/** Deletes a file from the storage provider and removes its record. */
export const deleteFile = async (fileId: string): Promise<void> => {
  const file = await FileModel.findById(fileId);
  if (!file) {
    throw AppError('File not found', StatusCodes.NOT_FOUND, ErrorCode.RESOURCE_NOT_FOUND);
  }

  const adapter = getStorageAdapter();
  const meta = (file.metadata ?? {}) as Record<string, unknown>;

  await adapter.delete(file.providerFileId, {
    resourceType: typeof meta.resourceType === 'string' ? meta.resourceType : undefined,
    deliveryType: typeof meta.deliveryType === 'string' ? meta.deliveryType : undefined,
  });

  await file.deleteOne();
};
