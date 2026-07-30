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

const createUnit = async (
  accessToken: string,
  propertyId: string,
  overrides: Record<string, unknown> = {},
) => {
  const res = await request(app)
    .post('/api/v1/units')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ property: propertyId, name: 'Unit 1A', ...overrides });

  return res.body.data.id as string;
};

const getUnit = (accessToken: string, unitId: string) =>
  request(app).get(`/api/v1/units/${unitId}`).set('Authorization', `Bearer ${accessToken}`);

const validTenantFields = (unitId: string, overrides: Record<string, unknown> = {}) => ({
  unit: unitId,
  fullName: 'Ndubuisi Eze',
  phone: '+2347050456329',
  rentAmount: 500000,
  paymentFrequency: 'yearly',
  lastPaymentDate: '2026-07-18T00:00:00.000Z',
  ...overrides,
});

const createTenant = (
  accessToken: string,
  unitId: string,
  overrides: Record<string, unknown> = {},
) =>
  request(app)
    .post('/api/v1/tenants')
    .set('Authorization', `Bearer ${accessToken}`)
    .send(validTenantFields(unitId, overrides));

describe('POST /api/v1/tenants', () => {
  it('creates a tenant assigned to a unit owned by the logged-in landlord', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    const unitId = await createUnit(accessToken, propertyId);

    const res = await createTenant(accessToken, unitId);

    expect(res.status).toBe(201);
    expect(res.body.data.unit.id).toBe(unitId);
    expect(res.body.data.unit.property.id).toBe(propertyId);
    expect(res.body.data.fullName).toBe('Ndubuisi Eze');
    expect(res.body.data.status).toBe('active');
  });

  it('computes nextDueDate one year after lastPaymentDate for a yearly tenant', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    const unitId = await createUnit(accessToken, propertyId);

    const res = await createTenant(accessToken, unitId, {
      paymentFrequency: 'yearly',
      lastPaymentDate: '2026-07-18T00:00:00.000Z',
    });

    expect(res.status).toBe(201);
    expect(new Date(res.body.data.nextDueDate).toISOString()).toBe('2027-07-18T00:00:00.000Z');
  });

  it('computes nextDueDate three months after lastPaymentDate for a quarterly tenant', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    const unitId = await createUnit(accessToken, propertyId);

    const res = await createTenant(accessToken, unitId, {
      paymentFrequency: 'quarterly',
      lastPaymentDate: '2026-07-18T00:00:00.000Z',
    });

    expect(res.status).toBe(201);
    expect(new Date(res.body.data.nextDueDate).toISOString()).toBe('2026-10-18T00:00:00.000Z');
  });

  it('marks the unit occupied when the new tenant is active (the default)', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    const unitId = await createUnit(accessToken, propertyId);

    const tenantRes = await createTenant(accessToken, unitId);
    const unitRes = await getUnit(accessToken, unitId);

    expect(unitRes.body.data.occupancyStatus).toBe('occupied');
    expect(unitRes.body.data.tenant).toBe(tenantRes.body.data.id);
  });

  it('leaves the unit vacant when the new tenant is pending, but still assigns it', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    const unitId = await createUnit(accessToken, propertyId);

    const tenantRes = await createTenant(accessToken, unitId, { status: 'pending' });
    const unitRes = await getUnit(accessToken, unitId);

    expect(unitRes.body.data.occupancyStatus).toBe('vacant');
    expect(unitRes.body.data.tenant).toBe(tenantRes.body.data.id);
  });

  it('rejects a request with no access token', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    const unitId = await createUnit(accessToken, propertyId);

    const res = await request(app).post('/api/v1/tenants').send(validTenantFields(unitId));

    expect(res.status).toBe(401);
  });

  it('rejects a missing full name', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    const unitId = await createUnit(accessToken, propertyId);

    const res = await createTenant(accessToken, unitId, { fullName: '' });

    expect(res.status).toBe(422);
  });

  it('rejects a missing payment frequency', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    const unitId = await createUnit(accessToken, propertyId);

    const res = await createTenant(accessToken, unitId, { paymentFrequency: undefined });

    expect(res.status).toBe(422);
  });

  it("rejects a tenant attached to another landlord's unit", async () => {
    const { accessToken: ownerToken } = await signupAndLogin(landlordPayload);
    const { accessToken: otherToken } = await signupAndLogin(otherLandlordPayload);
    const propertyId = await createProperty(ownerToken);
    const unitId = await createUnit(ownerToken, propertyId);

    const res = await createTenant(otherToken, unitId);

    expect(res.status).toBe(404);
  });

  it('rejects a nonexistent unit id', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const nonexistentId = new mongoose.Types.ObjectId().toString();

    const res = await createTenant(accessToken, nonexistentId);

    expect(res.status).toBe(404);
  });

  it('rejects a second active tenant for the same unit', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    const unitId = await createUnit(accessToken, propertyId);

    await createTenant(accessToken, unitId);
    const res = await createTenant(accessToken, unitId, { fullName: 'Second Tenant' });

    expect(res.status).toBe(409);
  });

  it('allows a pending tenant to coexist with an active tenant on the same unit', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    const unitId = await createUnit(accessToken, propertyId);

    await createTenant(accessToken, unitId);
    const res = await createTenant(accessToken, unitId, {
      fullName: 'Incoming Tenant',
      status: 'pending',
    });

    expect(res.status).toBe(201);
  });
});

describe('GET /api/v1/tenants', () => {
  it("only returns tenants under the logged-in landlord's own properties", async () => {
    const { accessToken: token1 } = await signupAndLogin(landlordPayload);
    const { accessToken: token2 } = await signupAndLogin(otherLandlordPayload);
    const propertyId1 = await createProperty(token1);
    const propertyId2 = await createProperty(token2);
    const unitId1 = await createUnit(token1, propertyId1);
    const unitId2 = await createUnit(token2, propertyId2);

    await createTenant(token1, unitId1);
    await createTenant(token2, unitId2);

    const res = await request(app).get('/api/v1/tenants').set('Authorization', `Bearer ${token1}`);

    expect(res.status).toBe(200);
    expect(res.body.tenants).toHaveLength(1);
  });

  it('filters by unit', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    const unitId1 = await createUnit(accessToken, propertyId);
    const unitId2 = await createUnit(accessToken, propertyId, { name: 'Unit 2B' });
    await createTenant(accessToken, unitId1);
    await createTenant(accessToken, unitId2, { fullName: 'Second Tenant' });

    const res = await request(app)
      .get(`/api/v1/tenants?unit=${unitId1}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.tenants).toHaveLength(1);
    expect(res.body.tenants[0].unit.id).toBe(unitId1);
  });

  it('filters by property', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId1 = await createProperty(accessToken);
    const propertyId2 = await createProperty(accessToken, { name: 'Palm Residences' });
    const unitId1 = await createUnit(accessToken, propertyId1);
    const unitId2 = await createUnit(accessToken, propertyId2);
    await createTenant(accessToken, unitId1);
    await createTenant(accessToken, unitId2, { fullName: 'Second Tenant' });

    const res = await request(app)
      .get(`/api/v1/tenants?property=${propertyId1}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.tenants).toHaveLength(1);
    expect(res.body.tenants[0].unit.property.id).toBe(propertyId1);
  });

  it("blocks filtering by another landlord's unit id", async () => {
    const { accessToken: ownerToken } = await signupAndLogin(landlordPayload);
    const { accessToken: otherToken } = await signupAndLogin(otherLandlordPayload);
    const propertyId = await createProperty(ownerToken);
    const unitId = await createUnit(ownerToken, propertyId);
    await createTenant(ownerToken, unitId);

    const res = await request(app)
      .get(`/api/v1/tenants?unit=${unitId}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(404);
  });

  it('filters by a case-insensitive match on full name', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    const unitId1 = await createUnit(accessToken, propertyId);
    const unitId2 = await createUnit(accessToken, propertyId, { name: 'Unit 2B' });
    await createTenant(accessToken, unitId1, { fullName: 'Okoro Mgbachi' });
    await createTenant(accessToken, unitId2, { fullName: 'Paschal Anorue' });

    const res = await request(app)
      .get('/api/v1/tenants?search=okoro')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.tenants).toHaveLength(1);
    expect(res.body.tenants[0].fullName).toBe('Okoro Mgbachi');
  });

  it('filters by status', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    const unitId1 = await createUnit(accessToken, propertyId);
    const unitId2 = await createUnit(accessToken, propertyId, { name: 'Unit 2B' });
    await createTenant(accessToken, unitId1, { fullName: 'Active Tenant', status: 'active' });
    await createTenant(accessToken, unitId2, { fullName: 'Pending Tenant', status: 'pending' });

    const res = await request(app)
      .get('/api/v1/tenants?status=pending')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.tenants).toHaveLength(1);
    expect(res.body.tenants[0].fullName).toBe('Pending Tenant');
  });

  it('sorts by fullName ascending when requested', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    const unitId1 = await createUnit(accessToken, propertyId);
    const unitId2 = await createUnit(accessToken, propertyId, { name: 'Unit 2B' });
    await createTenant(accessToken, unitId1, { fullName: 'Zainab Bello' });
    await createTenant(accessToken, unitId2, { fullName: 'Amaka Obi' });

    const res = await request(app)
      .get('/api/v1/tenants?sortBy=fullName&sortOrder=asc')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.tenants.map((t: { fullName: string }) => t.fullName)).toEqual([
      'Amaka Obi',
      'Zainab Bello',
    ]);
  });

  it('lets an admin see every tenant', async () => {
    const { accessToken: landlordToken } = await signupAndLogin(landlordPayload);
    const { accessToken: adminToken } = await asAdmin();
    const propertyId = await createProperty(landlordToken);
    const unitId = await createUnit(landlordToken, propertyId);
    await createTenant(landlordToken, unitId);

    const res = await request(app)
      .get('/api/v1/tenants')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.tenants.length).toBeGreaterThanOrEqual(1);
  });

  it('defaults page and limit when the query is omitted', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);

    const res = await request(app)
      .get('/api/v1/tenants')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 20 });
  });
});

describe('GET /api/v1/tenants/:id', () => {
  it("lets the unit's property owner fetch the tenant", async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    const unitId = await createUnit(accessToken, propertyId);
    const createRes = await createTenant(accessToken, unitId);

    const res = await request(app)
      .get(`/api/v1/tenants/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
  });

  it("blocks a different landlord from fetching someone else's tenant", async () => {
    const { accessToken: ownerToken } = await signupAndLogin(landlordPayload);
    const { accessToken: otherToken } = await signupAndLogin(otherLandlordPayload);
    const propertyId = await createProperty(ownerToken);
    const unitId = await createUnit(ownerToken, propertyId);
    const createRes = await createTenant(ownerToken, unitId);

    const res = await request(app)
      .get(`/api/v1/tenants/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('lets an admin fetch any tenant', async () => {
    const { accessToken: ownerToken } = await signupAndLogin(landlordPayload);
    const { accessToken: adminToken } = await asAdmin();
    const propertyId = await createProperty(ownerToken);
    const unitId = await createUnit(ownerToken, propertyId);
    const createRes = await createTenant(ownerToken, unitId);

    const res = await request(app)
      .get(`/api/v1/tenants/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });

  it('rejects an invalid id format', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);

    const res = await request(app)
      .get('/api/v1/tenants/not-a-valid-id')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ID');
  });

  it('returns 404 for a nonexistent tenant', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const nonexistentId = new mongoose.Types.ObjectId().toString();

    const res = await request(app)
      .get(`/api/v1/tenants/${nonexistentId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/tenants/:id', () => {
  it('lets the unit owner update the tenant', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    const unitId = await createUnit(accessToken, propertyId);
    const createRes = await createTenant(accessToken, unitId);

    const res = await request(app)
      .patch(`/api/v1/tenants/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ phone: '+2348000000000' });

    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBe('+2348000000000');
  });

  it('recomputes nextDueDate when lastPaymentDate changes', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    const unitId = await createUnit(accessToken, propertyId);
    const createRes = await createTenant(accessToken, unitId, { paymentFrequency: 'monthly' });

    const res = await request(app)
      .patch(`/api/v1/tenants/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ lastPaymentDate: '2026-08-01T00:00:00.000Z' });

    expect(res.status).toBe(200);
    expect(new Date(res.body.data.nextDueDate).toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('sets the unit back to vacant when the tenant becomes inactive', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    const unitId = await createUnit(accessToken, propertyId);
    const createRes = await createTenant(accessToken, unitId);

    await request(app)
      .patch(`/api/v1/tenants/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'inactive' });

    const unitRes = await getUnit(accessToken, unitId);

    expect(unitRes.body.data.occupancyStatus).toBe('vacant');
    expect(unitRes.body.data.tenant).toBeNull();
  });

  it('marks the unit occupied when a pending tenant becomes active', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    const unitId = await createUnit(accessToken, propertyId);
    const createRes = await createTenant(accessToken, unitId, { status: 'pending' });

    await request(app)
      .patch(`/api/v1/tenants/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'active' });

    const unitRes = await getUnit(accessToken, unitId);

    expect(unitRes.body.data.occupancyStatus).toBe('occupied');
  });

  it('rejects promoting a pending tenant to active when another active tenant already exists', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    const unitId = await createUnit(accessToken, propertyId);
    const pendingRes = await createTenant(accessToken, unitId, {
      fullName: 'Incoming Tenant',
      status: 'pending',
    });
    await createTenant(accessToken, unitId, { fullName: 'Current Tenant', status: 'active' });

    const res = await request(app)
      .patch(`/api/v1/tenants/${pendingRes.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'active' });

    expect(res.status).toBe(409);
  });

  it('blocks a non-owner from updating', async () => {
    const { accessToken: ownerToken } = await signupAndLogin(landlordPayload);
    const { accessToken: otherToken } = await signupAndLogin(otherLandlordPayload);
    const propertyId = await createProperty(ownerToken);
    const unitId = await createUnit(ownerToken, propertyId);
    const createRes = await createTenant(ownerToken, unitId);

    const res = await request(app)
      .patch(`/api/v1/tenants/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ fullName: 'Hijacked' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/tenants/:id', () => {
  it('lets the unit owner delete the tenant and frees up the unit', async () => {
    const { accessToken } = await signupAndLogin(landlordPayload);
    const propertyId = await createProperty(accessToken);
    const unitId = await createUnit(accessToken, propertyId);
    const createRes = await createTenant(accessToken, unitId);

    const res = await request(app)
      .delete(`/api/v1/tenants/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);

    const getRes = await request(app)
      .get(`/api/v1/tenants/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(getRes.status).toBe(404);

    const unitRes = await getUnit(accessToken, unitId);
    expect(unitRes.body.data.occupancyStatus).toBe('vacant');
    expect(unitRes.body.data.tenant).toBeNull();
  });

  it('blocks a non-owner from deleting', async () => {
    const { accessToken: ownerToken } = await signupAndLogin(landlordPayload);
    const { accessToken: otherToken } = await signupAndLogin(otherLandlordPayload);
    const propertyId = await createProperty(ownerToken);
    const unitId = await createUnit(ownerToken, propertyId);
    const createRes = await createTenant(ownerToken, unitId);

    const res = await request(app)
      .delete(`/api/v1/tenants/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(404);
  });
});
