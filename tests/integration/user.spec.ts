import { createApp } from '@/app';
import User from '@/db/models/user.model';
import { Types } from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Avatar upload goes through the storage provider (Cloudinary). Stub the file
// service so tests never touch the network — we only care that the endpoint
// wires the upload result onto the user and cleans up the old image.
vi.mock('@/services/file.service', () => ({
  // upload just needs to hand back a file reference for the user to point at
  uploadFile: vi.fn(async () => ({ file: { _id: new Types.ObjectId() } })),
  deleteFile: vi.fn(async () => undefined),
  // the avatar URL is resolved from the stored file on read
  getFileAccessUrl: vi.fn(async () => 'https://cdn.test/avatars/new-avatar.png'),
}));

const { uploadFile, deleteFile } = await import('@/services/file.service');
const app = await createApp();

const userPayload = {
  fullName: 'Regular User',
  email: 'regular@example.com',
  password: 'StrongPass1',
};

const adminPayload = {
  fullName: 'Admin User',
  email: 'admin@example.com',
  password: 'StrongPass1',
};

const login = (email: string, password: string) =>
  request(app).post('/api/v1/auth/login').send({ email, password });

const signupAndLogin = async (payload: typeof userPayload) => {
  const signupRes = await request(app).post('/api/v1/auth/signup').send(payload);
  const loginRes = await login(payload.email, payload.password);

  return { id: signupRes.body.data.id as string, accessToken: loginRes.body.data.accessToken as string };
};

const asAdmin = async () => {
  const { id } = await signupAndLogin(adminPayload);
  await User.findByIdAndUpdate(id, { role: 'admin' });

  // role is baked into the JWT payload at login time — re-login to get a token
  // that reflects the newly-promoted role
  const reLoginRes = await login(adminPayload.email, adminPayload.password);

  return { id, accessToken: reLoginRes.body.data.accessToken as string };
};

describe('GET /api/v1/users/me', () => {
  it("returns the logged-in user's own profile", async () => {
    const { accessToken } = await signupAndLogin(userPayload);

    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(userPayload.email);
    expect(res.body.data.password).toBeUndefined();
  });

  it('rejects a request with no access token', async () => {
    const res = await request(app).get('/api/v1/users/me');

    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v1/users/me', () => {
  it('updates fullName', async () => {
    const { accessToken } = await signupAndLogin(userPayload);

    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(res.body.data.fullName).toBe('Updated Name');
  });

  it('rejects a fullName that is too short', async () => {
    const { accessToken } = await signupAndLogin(userPayload);

    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'A' });

    expect(res.status).toBe(422);
  });
});

describe('PATCH /api/v1/users/me/password', () => {
  it('rejects the wrong current password', async () => {
    const { accessToken } = await signupAndLogin(userPayload);

    const res = await request(app)
      .patch('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'WrongOne1', newPassword: 'NewStrongPass1' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_PASSWORD');
  });

  it('rejects a new password identical to the current one', async () => {
    const { accessToken } = await signupAndLogin(userPayload);

    const res = await request(app)
      .patch('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: userPayload.password, newPassword: userPayload.password });

    expect(res.status).toBe(400);
  });

  it('changes the password and revokes the existing session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/signup').send(userPayload);
    const loginRes = await agent.post('/api/v1/auth/login').send({
      email: userPayload.email,
      password: userPayload.password,
    });
    const accessToken = loginRes.body.data.accessToken as string;

    const changeRes = await agent
      .patch('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: userPayload.password, newPassword: 'NewStrongPass1' });

    expect(changeRes.status).toBe(200);

    // the refresh cookie captured before the password change should now be dead
    const refreshRes = await agent.post('/api/v1/auth/refresh').send();
    expect(refreshRes.status).toBe(401);

    const oldLoginRes = await login(userPayload.email, userPayload.password);
    expect(oldLoginRes.status).toBe(401);

    const newLoginRes = await login(userPayload.email, 'NewStrongPass1');
    expect(newLoginRes.status).toBe(200);
  });
});

describe('PATCH /api/v1/users/me/avatar', () => {
  const pngBytes = Buffer.from('fake-png-bytes');

  beforeEach(() => {
    // reset call counts between tests but keep the mock implementations
    vi.clearAllMocks();
  });

  it('uploads a profile image and returns its URL', async () => {
    const { accessToken } = await signupAndLogin(userPayload);

    const res = await request(app)
      .patch('/api/v1/users/me/avatar')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('avatar', pngBytes, { filename: 'me.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.data.avatarUrl).toBe('https://cdn.test/avatars/new-avatar.png');
    expect(uploadFile).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-image file type with 415', async () => {
    const { accessToken } = await signupAndLogin(userPayload);

    const res = await request(app)
      .patch('/api/v1/users/me/avatar')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('avatar', Buffer.from('%PDF-1.4'), {
        filename: 'doc.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('returns 400 when no file is attached', async () => {
    const { accessToken } = await signupAndLogin(userPayload);

    const res = await request(app)
      .patch('/api/v1/users/me/avatar')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .patch('/api/v1/users/me/avatar')
      .attach('avatar', pngBytes, { filename: 'me.png', contentType: 'image/png' });

    expect(res.status).toBe(401);
  });

  it('deletes the previous image when a new one is uploaded', async () => {
    const { accessToken } = await signupAndLogin(userPayload);

    const upload = () =>
      request(app)
        .patch('/api/v1/users/me/avatar')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('avatar', pngBytes, { filename: 'me.png', contentType: 'image/png' });

    await upload(); // first upload — nothing to delete yet
    expect(deleteFile).not.toHaveBeenCalled();

    await upload(); // second upload — the first image should be cleaned up
    expect(deleteFile).toHaveBeenCalledTimes(1);
  });
});

describe('admin-only user management routes', () => {
  it('blocks a regular user from listing users', async () => {
    const { accessToken } = await signupAndLogin(userPayload);

    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(403);
  });

  it('lets an admin list users with pagination', async () => {
    const { accessToken } = await asAdmin();

    const res = await request(app)
      .get('/api/v1/users?page=1&limit=5')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 5 });
  });

  it('rejects an invalid user ID format', async () => {
    const { accessToken } = await asAdmin();

    const res = await request(app)
      .get('/api/v1/users/not-a-valid-id')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ID');
  });

  it('gets a single user by id', async () => {
    const { accessToken } = await asAdmin();
    const { id: targetId } = await signupAndLogin(userPayload);

    const res = await request(app)
      .get(`/api/v1/users/${targetId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(userPayload.email);
  });

  it('deactivates a user, blocking their login, then reactivates them', async () => {
    const { accessToken: adminToken } = await asAdmin();
    const { id: targetId } = await signupAndLogin(userPayload);

    const deactivateRes = await request(app)
      .patch(`/api/v1/users/${targetId}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.data.isActive).toBe(false);

    const blockedLoginRes = await login(userPayload.email, userPayload.password);
    expect(blockedLoginRes.status).toBe(403);

    const doubleDeactivateRes = await request(app)
      .patch(`/api/v1/users/${targetId}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(doubleDeactivateRes.status).toBe(409);

    const activateRes = await request(app)
      .patch(`/api/v1/users/${targetId}/activate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(activateRes.status).toBe(200);
    expect(activateRes.body.data.isActive).toBe(true);

    const doubleActivateRes = await request(app)
      .patch(`/api/v1/users/${targetId}/activate`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(doubleActivateRes.status).toBe(409);

    const restoredLoginRes = await login(userPayload.email, userPayload.password);
    expect(restoredLoginRes.status).toBe(200);
  });

  it('refuses to let an admin deactivate their own account', async () => {
    const { id: adminId, accessToken } = await asAdmin();

    const res = await request(app)
      .patch(`/api/v1/users/${adminId}/deactivate`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CANNOT_DEACTIVATE_LOGGED_IN_USER');
  });
});
