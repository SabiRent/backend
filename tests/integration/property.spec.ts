import { createApp } from '@/app';
import User from '@/db/models/user.model';
import type * as StorageService from '@/services/storage';
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/services/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof StorageService>();

  // A single stable object, not a fresh one per call — property.service.ts calls
  // getStorageAdapter() separately for upload and delete, and the call-count
  // assertions below need both calls landing on the same mock functions.
  const mockAdapter = {
    provider: 'cloudinary',
    upload: vi.fn(async () => ({
      providerFileId: 'properties/mock',
      url: 'https://res.cloudinary.com/test/image/upload/mock.png',
      metadata: { resourceType: 'image', deliveryType: 'upload' },
    })),
    getPublicUrl: vi.fn(),
    getSignedUrl: vi.fn(),
    delete: vi.fn(async () => undefined),
  };

  return {
    ...actual,
    getStorageAdapter: vi.fn(() => mockAdapter),
  };
});

const { getStorageAdapter } = await import('@/services/storage');
const mockAdapter = getStorageAdapter();

const app = await createApp();

const landlordPayload = {
  fullName: 'Landlord One',
  email: 'landlord1@example.com',
  password: 'StrongPass1',
};

const otherLandlordPayload = {
  fullName: 'Landlord Two',
  email: 'landlord2@example.com',
  password: 'StrongPass1',
};

const adminPayload = {
  fullName: 'Admin User',
  email: 'admin@example.com',
  password: 'StrongPass1',
};

const login = (email: string, password: string) =>
  request(app).post('/api/v1/auth/login').send({ email, password });

const signupAndLogin = async (payload: typeof landlordPayload) => {
  const signupRes = await request(app).post('/api/v1/auth/signup').send(payload);
  const loginRes = await login(payload.email, payload.password);

  return {
    id: signupRes.body.data.id as string,
    accessToken: loginRes.body.data.accessToken as string,
  };
};

const asAdmin = async () => {
  const { id } = await signupAndLogin(adminPayload);
  await User.findByIdAndUpdate(id, { role: 'admin' });

  // role is baked into the JWT payload at login time — re-login to get a token
  // that reflects the newly-promoted role
  const reLoginRes = await login(adminPayload.email, adminPayload.password);

  return { id, accessToken: reLoginRes.body.data.accessToken as string };
};

const validPropertyFields = {
  name: 'Cedar Court',
  address: JSON.stringify({ street: '7 Green Drive', city: 'Lekki', state: 'Lagos' }),
  unitCount: '12',
  description: 'A 12-unit estate',
};

const createProperty = (accessToken: string, overrides: Record<string, string> = {}) => {
  const fields = { ...validPropertyFields, ...overrides };
  const req = request(app).post('/api/v1/properties').set('Authorization', `Bearer ${accessToken}`);

  Object.entries(fields).forEach(([key, value]) => req.field(key, value));

  return req;
};

describe('POST /api/v1/properties', () => {
  it('creates a property owned by the logged-in landlord', async () => {
    const { accessToken, id } = await signupAndLogin(landlordPayload);

    const res = await createProperty(accessToken);

    expect(res.status).toBe(201);
    expect(res.body.data.owner).toBe(id);
    expect(res.body.data.address.city).toBe('Lekki');
    expect(res.body.data.unitCount).toBe(12);
  });

  it('uploads an image and stores the returned Cloudinary URL', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);

    const res = await createProperty(accessToken).attach(
      'image',
      Buffer.from('fake-image-data'),
      'photo.png',
    );

    expect(res.status).toBe(201);
    expect(res.body.data.image).toBe('https://res.cloudinary.com/test/image/upload/mock.png');
    expect(mockAdapter.upload).toHaveBeenCalledTimes(1);
  });

  it('rejects an unsupported file type', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);

    const res = await createProperty(accessToken).attach(
      'image',
      Buffer.from('not an image'),
      'notes.txt',
    );

    expect(res.status).toBe(415);
  });

  it('rejects a request with no access token', async () => {
    const req = request(app).post('/api/v1/properties');
    Object.entries(validPropertyFields).forEach(([key, value]) => req.field(key, value));

    const res = await req;
    expect(res.status).toBe(401);
  });

  it('rejects a missing property name', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);

    const res = await createProperty(accessToken, { name: '' });

    expect(res.status).toBe(422);
  });

  it('rejects unitCount below 1', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);

    const res = await createProperty(accessToken, { unitCount: '0' });

    expect(res.status).toBe(422);
  });

  it('rejects an address missing city', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);

    const res = await createProperty(accessToken, {
      address: JSON.stringify({ street: '7 Green Drive' }),
    });

    expect(res.status).toBe(422);
  });
});

describe('GET /api/v1/properties', () => {
  it("only returns the logged-in landlord's own properties", async () => {
    const { accessToken: token1 } = await signupAndLogin(landlordPayload);
    const { accessToken: token2 } = await signupAndLogin(otherLandlordPayload);

    await createProperty(token1);
    await createProperty(token2);

    const res = await request(app)
      .get('/api/v1/properties')
      .set('Authorization', `Bearer ${token1}`);

    expect(res.status).toBe(200);
    expect(res.body.properties).toHaveLength(1);
  });

  it('defaults page and limit when the query is omitted', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);

    const res = await request(app)
      .get('/api/v1/properties')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 20 });
  });

  it('coerces string query values to numbers', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);

    const res = await request(app)
      .get('/api/v1/properties?page=2&limit=5')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ page: 2, limit: 5 });
  });

  it('rejects a non-numeric page value', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);

    const res = await request(app)
      .get('/api/v1/properties?page=abc')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(422);
  });

  it('rejects a limit above the maximum', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);

    const res = await request(app)
      .get('/api/v1/properties?limit=500')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(422);
  });

  it('lets an admin see every property', async () => {
    const { accessToken: landlordToken } = await signupAndLogin(landlordPayload);
    const { accessToken: adminToken } = await asAdmin();

    await createProperty(landlordToken);

    const res = await request(app)
      .get('/api/v1/properties')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.properties.length).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/v1/properties/:id', () => {
  it('lets the owner fetch their property', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const createRes = await createProperty(accessToken);

    const res = await request(app)
      .get(`/api/v1/properties/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
  });

  it("blocks a different landlord from fetching someone else's property", async () => {
    const { accessToken: ownerToken } = await signupAndLogin(landlordPayload);
    const { accessToken: otherToken } = await signupAndLogin(otherLandlordPayload);
    const createRes = await createProperty(ownerToken);

    const res = await request(app)
      .get(`/api/v1/properties/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${otherToken}`);

    // 404, not 403 — a non-owner shouldn't be able to tell "not yours" from "doesn't exist"
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('lets an admin fetch any property', async () => {
    const { accessToken: ownerToken } = await signupAndLogin(landlordPayload);
    const { accessToken: adminToken } = await asAdmin();
    const createRes = await createProperty(ownerToken);

    const res = await request(app)
      .get(`/api/v1/properties/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });

  it('rejects an invalid id format', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);

    const res = await request(app)
      .get('/api/v1/properties/not-a-valid-id')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ID');
  });

  it('returns 404 for a nonexistent property', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const nonexistentId = new mongoose.Types.ObjectId().toString();

    const res = await request(app)
      .get(`/api/v1/properties/${nonexistentId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/properties/:id', () => {
  it('lets the owner update their property', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const createRes = await createProperty(accessToken);

    const res = await request(app)
      .patch(`/api/v1/properties/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .field('name', 'Updated Name');

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Name');
  });

  it('replaces the image and deletes the old one from Cloudinary', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const createRes = await createProperty(accessToken).attach(
      'image',
      Buffer.from('a'),
      'a.png',
    );

    const res = await request(app)
      .patch(`/api/v1/properties/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('image', Buffer.from('b'), 'b.png');

    expect(res.status).toBe(200);
    expect(mockAdapter.delete).toHaveBeenCalledTimes(1);
  });

  it('blocks a non-owner from updating', async () => {
    const { accessToken: ownerToken } = await signupAndLogin(landlordPayload);
    const { accessToken: otherToken } = await signupAndLogin(otherLandlordPayload);
    const createRes = await createProperty(ownerToken);

    const res = await request(app)
      .patch(`/api/v1/properties/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .field('name', 'Hijacked');

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/properties/:id', () => {
  it('lets the owner delete their property', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const createRes = await createProperty(accessToken);

    const res = await request(app)
      .delete(`/api/v1/properties/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);

    const getRes = await request(app)
      .get(`/api/v1/properties/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(getRes.status).toBe(404);
  });

  it('blocks a non-owner from deleting', async () => {
    const { accessToken: ownerToken } = await signupAndLogin(landlordPayload);
    const { accessToken: otherToken } = await signupAndLogin(otherLandlordPayload);
    const createRes = await createProperty(ownerToken);

    const res = await request(app)
      .delete(`/api/v1/properties/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(404);
  });
});
