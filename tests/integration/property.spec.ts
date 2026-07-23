import { createApp } from '@/app';
import User from '@/db/models/user.model';
import type * as CloudinaryUtil from '@/utils/cloudinary.util';
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/cloudinary.util', async (importOriginal) => {
  const actual = await importOriginal<typeof CloudinaryUtil>();

  return {
    ...actual,
    uploadImageBuffer: vi.fn(async () => ({
      secureUrl: 'https://res.cloudinary.com/test/image/upload/mock.png',
      publicId: 'properties/mock',
    })),
    deleteImage: vi.fn(async () => undefined),
  };
});

const { uploadImageBuffer, deleteImage } = await import('@/utils/cloudinary.util');

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
  type: 'residential',
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
    expect(uploadImageBuffer).toHaveBeenCalledTimes(1);
  });

  it('rejects an unsupported file type', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);

    const res = await createProperty(accessToken).attach(
      'image',
      Buffer.from('not an image'),
      'notes.txt',
    );

    expect(res.status).toBe(400);
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

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_PROPERTY_OWNER');
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
    expect(deleteImage).toHaveBeenCalledTimes(1);
  });

  it('blocks a non-owner from updating', async () => {
    const { accessToken: ownerToken } = await signupAndLogin(landlordPayload);
    const { accessToken: otherToken } = await signupAndLogin(otherLandlordPayload);
    const createRes = await createProperty(ownerToken);

    const res = await request(app)
      .patch(`/api/v1/properties/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .field('name', 'Hijacked');

    expect(res.status).toBe(403);
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

    expect(res.status).toBe(403);
  });
});
