import { createApp } from '@/app';
import type * as EmailQueue from '@/queues/email.queue';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Auth hands emails to the queue — stub the producer so no real SMTP happens.
// Dispatch still renders the (real) template before this no-op runs.
vi.mock('@/queues/email.queue', async (importOriginal) => {
  const actual = await importOriginal<typeof EmailQueue>();

  return {
    ...actual,
    enqueueEmail: vi.fn(),
  };
});

const { enqueueEmail } = await import('@/queues/email.queue');
const app = await createApp();

const signupPayload = {
  fullName: 'Jane Doe',
  email: 'jane@example.com',
  password: 'StrongPass1',
};

const login = (email: string, password: string) =>
  request(app).post('/api/v1/auth/login').send({ email, password });

describe('POST /api/v1/auth/signup', () => {
  it('creates a new account without leaking the password hash', async () => {
    const res = await request(app).post('/api/v1/auth/signup').send(signupPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(signupPayload.email);
    expect(res.body.data.password).toBeUndefined();
  });

  it('rejects a duplicate email', async () => {
    await request(app).post('/api/v1/auth/signup').send(signupPayload);

    const res = await request(app).post('/api/v1/auth/signup').send(signupPayload);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_ENTRY');
  });

  it('rejects a password that fails the strength rules', async () => {
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ ...signupPayload, password: 'weak' });

    expect(res.status).toBe(422);
    expect(res.body.errors.password).toBeDefined();
  });
});

describe('POST /api/v1/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/v1/auth/signup').send(signupPayload);
  });

  it('logs in with correct credentials and sets a refresh cookie', async () => {
    const res = await login(signupPayload.email, signupPayload.password);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.headers['set-cookie'][0]).toMatch(/refreshToken=/);
  });

  it('rejects the wrong password', async () => {
    const res = await login(signupPayload.email, 'WrongPass1');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_EMAIL_PWD');
  });

  it('gives the identical error for a nonexistent email (no enumeration)', async () => {
    const res = await login('nobody@example.com', 'WhoKnows1');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_EMAIL_PWD');
  });

  it('locks the account after 5 failed attempts, even for the correct password', async () => {
    for (let i = 0; i < 5; i += 1) {
      await login(signupPayload.email, 'WrongPass1');
    }

    const res = await login(signupPayload.email, signupPayload.password);

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
  });
});

describe('POST /api/v1/auth/refresh', () => {
  beforeEach(async () => {
    await request(app).post('/api/v1/auth/signup').send(signupPayload);
  });

  it('issues a new access token for a valid refresh cookie', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({
      email: signupPayload.email,
      password: signupPayload.password,
    });

    const res = await agent.post('/api/v1/auth/refresh').send();

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
  });

  it('rejects a refresh token that was already rotated out', async () => {
    const agent = request.agent(app);
    const loginRes = await agent.post('/api/v1/auth/login').send({
      email: signupPayload.email,
      password: signupPayload.password,
    });
    const originalCookie = loginRes.headers['set-cookie'][0] as string;

    // JWTs only carry second-level timestamps — without a real gap, the
    // "rotated" token can come out byte-identical to the original and this
    // test would pass for the wrong reason.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await agent.post('/api/v1/auth/refresh').send();

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', originalCookie)
      .send();

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_EXPIRED_TOKEN');
  });

  it('rejects when no refresh cookie is present', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send();

    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('revokes the refresh token server-side, not just the cookie', async () => {
    await request(app).post('/api/v1/auth/signup').send(signupPayload);

    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({
      email: signupPayload.email,
      password: signupPayload.password,
    });

    const logoutRes = await agent.post('/api/v1/auth/logout').send();
    expect(logoutRes.status).toBe(200);

    const refreshRes = await agent.post('/api/v1/auth/refresh').send();
    expect(refreshRes.status).toBe(401);
  });
});

describe('POST /api/v1/auth/forgot-password', () => {
  beforeEach(async () => {
    await request(app).post('/api/v1/auth/signup').send(signupPayload);
    vi.clearAllMocks();
  });

  it('sends a reset email for a registered account', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: signupPayload.email });

    expect(res.status).toBe(200);
    expect(enqueueEmail).toHaveBeenCalledTimes(1);
  });

  it('returns the identical response for an unregistered email, sending nothing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(enqueueEmail).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/auth/reset-password', () => {
  beforeEach(async () => {
    await request(app).post('/api/v1/auth/signup').send(signupPayload);
    vi.clearAllMocks();
  });

  it('resets the password and invalidates existing sessions', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({
      email: signupPayload.email,
      password: signupPayload.password,
    });

    await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: signupPayload.email });

    // The reset link is rendered into the email HTML by the dispatch layer;
    // pull the token back out of the enqueued job's body.
    const enqueuedHtml = vi.mocked(enqueueEmail).mock.calls[0][0].html ?? '';
    const resetToken = enqueuedHtml.match(/token=([^"'&\s]+)/)?.[1];

    const resetRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: resetToken, newPassword: 'NewStrongPass1' });

    expect(resetRes.status).toBe(200);

    const refreshRes = await agent.post('/api/v1/auth/refresh').send();
    expect(refreshRes.status).toBe(401);

    const newLoginRes = await login(signupPayload.email, 'NewStrongPass1');
    expect(newLoginRes.status).toBe(200);

    const oldLoginRes = await login(signupPayload.email, signupPayload.password);
    expect(oldLoginRes.status).toBe(401);
  });

  it('rejects an invalid reset token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'garbage.invalid.token', newPassword: 'NewStrongPass1' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_EXPIRED_TOKEN');
  });

  it('is single-use — a reset token cannot be replayed', async () => {
    await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: signupPayload.email });

    const enqueuedHtml = vi.mocked(enqueueEmail).mock.calls[0][0].html ?? '';
    const resetToken = enqueuedHtml.match(/token=([^"'&\s]+)/)?.[1];

    const first = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: resetToken, newPassword: 'NewStrongPass1' });
    expect(first.status).toBe(200);

    // the token was consumed on first use — a second attempt finds no record
    const second = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: resetToken, newPassword: 'AnotherPass1' });
    expect(second.status).toBe(401);
    expect(second.body.error.code).toBe('INVALID_EXPIRED_TOKEN');
  });
});
