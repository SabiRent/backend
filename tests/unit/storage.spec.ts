import { StorageProvider } from '@/constants/storage';
import { CloudinaryAdapter } from '@/services/storage/cloudinary.adapter';
import { getStorageAdapter } from '@/services/storage';
import { describe, expect, it } from 'vitest';

describe('getStorageAdapter', () => {
  it('resolves the Cloudinary adapter for the cloudinary provider', () => {
    const adapter = getStorageAdapter(StorageProvider.CLOUDINARY);

    expect(adapter).toBeInstanceOf(CloudinaryAdapter);
    expect(adapter.provider).toBe(StorageProvider.CLOUDINARY);
  });

  it('throws for a provider that is not yet implemented', () => {
    expect(() => getStorageAdapter(StorageProvider.S3)).toThrow(/Unsupported or unconfigured/);
  });

  it('throws for an unknown provider name', () => {
    expect(() => getStorageAdapter('sftp')).toThrow(/Unsupported or unconfigured/);
  });
});
