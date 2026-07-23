import { FILE_STORAGE_PROVIDER } from '@/config/env.config';
import { ErrorCode } from '@/constants/error-code';
import { StorageProvider } from '@/constants/storage';
import AppError from '@/errors/AppError';
import type { StorageAdapter } from '@/types/storage.types';
import { StatusCodes } from 'http-status-codes';
import { CloudinaryAdapter } from './cloudinary.adapter';

/**
 * Registry of available storage backends. Add S3/R2 here when implemented —
 * callers resolve their adapter through {@link getStorageAdapter} and never
 * reference a concrete provider.
 */
const adapterFactories: Partial<Record<StorageProvider, () => StorageAdapter>> = {
  [StorageProvider.CLOUDINARY]: () => new CloudinaryAdapter(),
  // [StorageProvider.S3]: () => new S3Adapter(),
  // [StorageProvider.R2]: () => new R2Adapter(),
};

let cached: StorageAdapter | null = null;

/**
 * Resolves the active storage adapter. Defaults to the provider named by the
 * FILE_STORAGE_PROVIDER env var; pass `providerName` to resolve a specific one
 * (used in tests, bypasses the cache).
 */
export const getStorageAdapter = (providerName?: string): StorageAdapter => {
  const usingDefault = providerName === undefined;
  if (usingDefault && cached) return cached;

  const provider = (providerName ?? FILE_STORAGE_PROVIDER) as StorageProvider;
  const factory = adapterFactories[provider];

  if (!factory) {
    throw AppError(
      `Unsupported or unconfigured storage provider: "${provider}"`,
      StatusCodes.INTERNAL_SERVER_ERROR,
      ErrorCode.INTERNAL_SERVER_ERROR,
    );
  }

  const adapter = factory();
  if (usingDefault) cached = adapter;
  return adapter;
};

/** Clears the memoised default adapter — intended for tests. */
export const resetStorageAdapter = (): void => {
  cached = null;
};
