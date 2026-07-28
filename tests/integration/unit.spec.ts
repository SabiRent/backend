import { createApp } from '@/app';
import User from '@/db/models/user.model';
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

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
  await request(app).post('/api/v1/auth/signup').send(payload);
  const loginRes = await login(payload.email, payload.password);

  return { accessToken: loginRes.body.data.accessToken as string };
};

const asAdmin = async () => {
  const signupRes = await request(app).post('/api/v1/auth/signup').send(adminPayload);
  await User.findByIdAndUpdate(signupRes.body.data.id, { role: 'admin' });

  // role is baked into the JWT payload at login time — re-login to get a token
  // that reflects the newly-promoted role
  const loginRes = await login(adminPayload.email, adminPayload.password);

  return { accessToken: loginRes.body.data.accessToken as string };
};

const validPropertyFields = {
  name: 'Cedar Court',
  address: JSON.stringify({ street: '7 Green Drive', city: 'Lekki', state: 'Lagos' }),
  unitCount: '12',
};

const createProperty = async (accessToken: string, overrides: Record<string, string> = {}) => {
  const fields = { ...validPropertyFields, ...overrides };
  const req = request(app).post('/api/v1/properties').set('Authorization', `Bearer ${accessToken}`);

  Object.entries(fields).forEach(([key, value]) => req.field(key, value));
  const res = await req;

  return res.body.data.id as string;
};

const validUnitFields = (propertyId: string, overrides: Record<string, unknown> = {}) => ({
  property: propertyId,
  name: 'Unit 1A',
  rentAmount: 500000,
  ...overrides,
});

const createUnit = (
  accessToken: string,
  propertyId: string,
  overrides: Record<string, unknown> = {},
) =>
  request(app)
    .post('/api/v1/units')
    .set('Authorization', `Bearer ${accessToken}`)
    .send(validUnitFields(propertyId, overrides));

describe('POST /api/v1/units', () => {
  it('creates a unit under a property owned by the logged-in landlord', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);

    const res = await createUnit(accessToken, propertyId);

    expect(res.status).toBe(201);
    expect(res.body.data.property.id).toBe(propertyId);
    expect(res.body.data.name).toBe('Unit 1A');
    expect(res.body.data.occupancyStatus).toBe('vacant');
    expect(res.body.data.rentInterval).toBe('yearly');
  });

  it('rejects a request with no access token', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);

    const res = await request(app)
      .post('/api/v1/units')
      .send(validUnitFields(propertyId));

    expect(res.status).toBe(401);
  });

  it('rejects a missing unit name', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);

    const res = await createUnit(accessToken, propertyId, { name: '' });

    expect(res.status).toBe(422);
  });

  it('rejects a negative rent amount', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);

    const res = await createUnit(accessToken, propertyId, { rentAmount: -1 });

    expect(res.status).toBe(422);
  });

  it("rejects a unit attached to another landlord's property", async () => {
    const { accessToken: ownerToken } = await signupAndLogin(landlordPayload);
    const { accessToken: otherToken } = await signupAndLogin(otherLandlordPayload);
    const propertyId = await createProperty(ownerToken);

    const res = await createUnit(otherToken, propertyId);

    expect(res.status).toBe(404);
  });

  it('rejects a nonexistent property id', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const nonexistentId = new mongoose.Types.ObjectId().toString();

    const res = await createUnit(accessToken, nonexistentId);

    expect(res.status).toBe(404);
  });

  it('rejects a duplicate unit name within the same property', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);

    await createUnit(accessToken, propertyId);
    const res = await createUnit(accessToken, propertyId);

    expect(res.status).toBe(409);
  });

  it('allows the same unit name across two different properties', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId1 = await createProperty(accessToken);
    const propertyId2 = await createProperty(accessToken, { name: 'Palm Residences' });

    await createUnit(accessToken, propertyId1);
    const res = await createUnit(accessToken, propertyId2);

    expect(res.status).toBe(201);
  });
});

describe('GET /api/v1/units', () => {
  it("only returns units under the logged-in landlord's own properties", async () => {
    const { accessToken: token1 } = await signupAndLogin(landlordPayload);
    const { accessToken: token2 } = await signupAndLogin(otherLandlordPayload);
    const propertyId1 = await createProperty(token1);
    const propertyId2 = await createProperty(token2);

    await createUnit(token1, propertyId1);
    await createUnit(token2, propertyId2);

    const res = await request(app).get('/api/v1/units').set('Authorization', `Bearer ${token1}`);

    expect(res.status).toBe(200);
    expect(res.body.units).toHaveLength(1);
  });

  it('filters by propertyId', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId1 = await createProperty(accessToken);
    const propertyId2 = await createProperty(accessToken, { name: 'Palm Residences' });
    await createUnit(accessToken, propertyId1);
    await createUnit(accessToken, propertyId2, { name: 'Unit 2B' });

    const res = await request(app)
      .get(`/api/v1/units?property=${propertyId1}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.units).toHaveLength(1);
    expect(res.body.units[0].property.id).toBe(propertyId1);
  });

  it("blocks filtering by another landlord's property id", async () => {
    const { accessToken: ownerToken } = await signupAndLogin(landlordPayload);
    const { accessToken: otherToken } = await signupAndLogin(otherLandlordPayload);
    const propertyId = await createProperty(ownerToken);
    await createUnit(ownerToken, propertyId);

    const res = await request(app)
      .get(`/api/v1/units?property=${propertyId}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(404);
  });

  it('filters by a case-insensitive match on unit name', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    await createUnit(accessToken, propertyId, { name: 'Block C' });
    await createUnit(accessToken, propertyId, { name: 'Flat 2' });

    const res = await request(app)
      .get('/api/v1/units?search=block')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.units).toHaveLength(1);
    expect(res.body.units[0].name).toBe('Block C');
  });

  it('filters by occupancyStatus', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    await createUnit(accessToken, propertyId, { name: 'Occupied Unit', occupancyStatus: 'occupied' });
    await createUnit(accessToken, propertyId, { name: 'Vacant Unit', occupancyStatus: 'vacant' });

    const res = await request(app)
      .get('/api/v1/units?occupancyStatus=occupied')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.units).toHaveLength(1);
    expect(res.body.units[0].name).toBe('Occupied Unit');
  });

  it('sorts by rentAmount ascending when requested', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    await createUnit(accessToken, propertyId, { name: 'Big Unit', rentAmount: 900000 });
    await createUnit(accessToken, propertyId, { name: 'Small Unit', rentAmount: 100000 });

    const res = await request(app)
      .get('/api/v1/units?sortBy=rentAmount&sortOrder=asc')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.units.map((u: { name: string }) => u.name)).toEqual([
      'Small Unit',
      'Big Unit',
    ]);
  });

  it('lets an admin see every unit', async () => {
    const { accessToken: landlordToken } = await signupAndLogin(landlordPayload);
    const { accessToken: adminToken } = await asAdmin();
    const propertyId = await createProperty(landlordToken);
    await createUnit(landlordToken, propertyId);

    const res = await request(app).get('/api/v1/units').set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.units.length).toBeGreaterThanOrEqual(1);
  });

  it('defaults page and limit when the query is omitted', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);

    const res = await request(app).get('/api/v1/units').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 20 });
  });
});

describe('GET /api/v1/units/:id', () => {
  it("lets the property owner fetch the unit", async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    const createRes = await createUnit(accessToken, propertyId);

    const res = await request(app)
      .get(`/api/v1/units/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
  });

  it("blocks a different landlord from fetching someone else's unit", async () => {
    const { accessToken: ownerToken } = await signupAndLogin(landlordPayload);
    const { accessToken: otherToken } = await signupAndLogin(otherLandlordPayload);
    const propertyId = await createProperty(ownerToken);
    const createRes = await createUnit(ownerToken, propertyId);

    const res = await request(app)
      .get(`/api/v1/units/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${otherToken}`);

    // 404, not 403 — same masking rule as properties
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('lets an admin fetch any unit', async () => {
    const { accessToken: ownerToken } = await signupAndLogin(landlordPayload);
    const { accessToken: adminToken } = await asAdmin();
    const propertyId = await createProperty(ownerToken);
    const createRes = await createUnit(ownerToken, propertyId);

    const res = await request(app)
      .get(`/api/v1/units/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });

  it('rejects an invalid id format', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);

    const res = await request(app)
      .get('/api/v1/units/not-a-valid-id')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ID');
  });

  it('returns 404 for a nonexistent unit', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const nonexistentId = new mongoose.Types.ObjectId().toString();

    const res = await request(app)
      .get(`/api/v1/units/${nonexistentId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/units/:id', () => {
  it('lets the property owner update the unit', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    const createRes = await createUnit(accessToken, propertyId);

    const res = await request(app)
      .patch(`/api/v1/units/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ occupancyStatus: 'occupied' });

    expect(res.status).toBe(200);
    expect(res.body.data.occupancyStatus).toBe('occupied');
  });

  it('rejects renaming a unit to clash with another unit in the same property', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    await createUnit(accessToken, propertyId, { name: 'Block A' });
    const createRes = await createUnit(accessToken, propertyId, { name: 'Block B' });

    const res = await request(app)
      .patch(`/api/v1/units/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Block A' });

    expect(res.status).toBe(409);
  });

  it('blocks a non-owner from updating', async () => {
    const { accessToken: ownerToken } = await signupAndLogin(landlordPayload);
    const { accessToken: otherToken } = await signupAndLogin(otherLandlordPayload);
    const propertyId = await createProperty(ownerToken);
    const createRes = await createUnit(ownerToken, propertyId);

    const res = await request(app)
      .patch(`/api/v1/units/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: 'Hijacked' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/units/:id', () => {
  it('lets the property owner delete the unit', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    const createRes = await createUnit(accessToken, propertyId);

    const res = await request(app)
      .delete(`/api/v1/units/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);

    const getRes = await request(app)
      .get(`/api/v1/units/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(getRes.status).toBe(404);
  });

  it('blocks a non-owner from deleting', async () => {
    const { accessToken: ownerToken } = await signupAndLogin(landlordPayload);
    const { accessToken: otherToken } = await signupAndLogin(otherLandlordPayload);
    const propertyId = await createProperty(ownerToken);
    const createRes = await createUnit(ownerToken, propertyId);

    const res = await request(app)
      .delete(`/api/v1/units/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(404);
  });
});
