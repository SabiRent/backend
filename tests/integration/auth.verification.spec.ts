import { createApp } from '@/app';
import { VERIFICATION_TOKEN_SECRET } from '@/config/env.config';
import User from '@/db/models/user.model';
import type * as HelperUtil from '@/utils/helper.util';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Never send real email in tests — mock the transport-facing helper.
vi.mock('@/utils/helper.util', async (importOriginal) => {
  const actual = await importOriginal<typeof HelperUtil>();

  return {
    ...actual,
    sendEmail: vi.fn(),
  };
});

const { sendEmail } = await import('@/utils/helper.util');
const app = await createApp();

const signupPayload = {
  fullName: 'Jane Doe',
  email: 'jane@example.com',
  password: 'StrongPass1',
};

const signup = () => request(app).post('/api/v1/auth/signup').send(signupPayload);
const login = (email: string, password: string) =>
  request(app).post('/api/v1/auth/login').send({ email, password });

// Control the verified flag directly so these tests don't depend on the
// SHOULD_VERIFY_USER env toggle used at signup.
const setVerified = (email: string, isVerified: boolean) =>
  User.updateOne({ email }, { isVerified });

const forgeVerificationToken = (id: string) =>
  jwt.sign({ id }, VERIFICATION_TOKEN_SECRET, { expiresIn: '1d' });

const userId = async (email: string) => {
  const user = await User.findOne({ email });
  return user!._id.toString();
};

describe('login verification gate', () => {
  beforeEach(async () => {
    await signup();
    vi.clearAllMocks();
  });

  it('blocks login with a 403 when the account is not verified', async () => {
    await setVerified(signupPayload.email, false);

    const res = await login(signupPayload.email, signupPayload.password);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('allows login once the account is verified', async () => {
    await setVerified(signupPayload.email, true);

    const res = await login(signupPayload.email, signupPayload.password);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
  });

  it('still returns the generic 401 for a wrong password on an unverified account (no enumeration)', async () => {
    await setVerified(signupPayload.email, false);

    const res = await login(signupPayload.email, 'WrongPass1');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_EMAIL_PWD');
  });
});

describe('POST /api/v1/auth/verify-email', () => {
  beforeEach(async () => {
    await signup();
    await setVerified(signupPayload.email, false);
    vi.clearAllMocks();
  });

  it('verifies the account with a valid token and sends a welcome email', async () => {
    const token = forgeVerificationToken(await userId(signupPayload.email));

    const res = await request(app).post('/api/v1/auth/verify-email').send({ token });

    expect(res.status).toBe(200);

    const user = await User.findOne({ email: signupPayload.email });
    expect(user!.isVerified).toBe(true);

    // welcome email is sent on successful verification
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0].template).toBe('welcome.temp.ejs');
  });

  it('lets the user log in after verifying', async () => {
    const token = forgeVerificationToken(await userId(signupPayload.email));
    await request(app).post('/api/v1/auth/verify-email').send({ token });

    const res = await login(signupPayload.email, signupPayload.password);

    expect(res.status).toBe(200);
  });

  it('rejects an invalid token with 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: 'garbage.invalid.token' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_EXPIRED_TOKEN');
  });

  it('rejects an already-verified account with 409', async () => {
    await setVerified(signupPayload.email, true);
    const token = forgeVerificationToken(await userId(signupPayload.email));

    const res = await request(app).post('/api/v1/auth/verify-email').send({ token });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('USER_ALREADY_VERIFIED');
  });

  it('rejects a missing token with a 422 validation error', async () => {
    const res = await request(app).post('/api/v1/auth/verify-email').send({});

    expect(res.status).toBe(422);
    expect(res.body.errors.token).toBeDefined();
  });
});

describe('POST /api/v1/auth/resend-verification', () => {
  beforeEach(async () => {
    await signup();
    await setVerified(signupPayload.email, false);
    vi.clearAllMocks();
  });

  it('sends a fresh verification email for an unverified account', async () => {
    const res = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: signupPayload.email });

    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0].template).toBe('verify-email.temp.ejs');
  });

  it('sends nothing for an already-verified account, but returns the same 200', async () => {
    await setVerified(signupPayload.email, true);

    const res = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: signupPayload.email });

    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('sends nothing for an unregistered email, but returns the same 200 (no enumeration)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('rate-limits after 3 resends for the same email', async () => {
    const resend = () =>
      request(app).post('/api/v1/auth/resend-verification').send({ email: signupPayload.email });

    await resend();
    await resend();
    await resend();

    const res = await resend();

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
  });
});
