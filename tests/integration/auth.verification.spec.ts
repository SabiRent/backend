import { createApp } from '@/app';
import { VERIFICATION_TOKEN_SECRET } from '@/config/env.config';
import Token, { TokenType } from '@/db/models/token.model';
import User from '@/db/models/user.model';
import type * as EmailQueue from '@/queues/email.queue';
import { generateToken, hashToken } from '@/utils/helper.util';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Never send real email in tests — auth hands emails to the queue, so stub the
// producer. Dispatch still renders the (real) template before this no-op runs.
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

const signup = () => request(app).post('/api/v1/auth/signup').send(signupPayload);
const login = (email: string, password: string) =>
  request(app).post('/api/v1/auth/login').send({ email, password });

// Control the verified flag directly so these tests don't depend on the
// SHOULD_VERIFY_USER env toggle used at signup.
const setVerified = (email: string, isVerified: boolean) =>
  User.updateOne({ email }, { isVerified });

const userId = async (email: string) => {
  const user = await User.findOne({ email });
  return user!._id.toString();
};

// Persist a real verification token (the flow now looks up a DB record by hash,
// not a self-contained JWT) and hand back the raw token that would go in the link.
const issueVerificationToken = async (id: string, expiresAt = new Date(Date.now() + 60_000)) => {
  const rawToken = generateToken();
  await Token.create({
    user: id,
    tokenHash: hashToken(rawToken, VERIFICATION_TOKEN_SECRET),
    type: TokenType.EMAIL_VERIFICATION,
    expiresAt,
  });
  return rawToken;
};

const verifyRequest = (token: string) =>
  request(app).post('/api/v1/auth/verify-email').send({ token });

// The verify link is rendered into the enqueued email's HTML — pull the raw token
// back out so tests can drive the exact link a user would click.
const tokenFromEnqueuedEmail = (callIndex: number) => {
  const html = vi.mocked(enqueueEmail).mock.calls[callIndex][0].html ?? '';
  return html.match(/token=([^"'&\s]+)/)?.[1] ?? '';
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
    const token = await issueVerificationToken(await userId(signupPayload.email));

    const res = await verifyRequest(token);

    expect(res.status).toBe(200);

    const user = await User.findOne({ email: signupPayload.email });
    expect(user!.isVerified).toBe(true);

    // welcome email is enqueued on successful verification
    expect(enqueueEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(enqueueEmail).mock.calls[0][0].subject).toBe('Welcome to MyCompound');
  });

  it('lets the user log in after verifying', async () => {
    const token = await issueVerificationToken(await userId(signupPayload.email));
    await verifyRequest(token);

    const res = await login(signupPayload.email, signupPayload.password);

    expect(res.status).toBe(200);
  });

  it('rejects an invalid token with 401', async () => {
    const res = await verifyRequest('garbage.invalid.token');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_EXPIRED_TOKEN');
  });

  it('rejects an expired token with 401', async () => {
    const token = await issueVerificationToken(
      await userId(signupPayload.email),
      new Date(Date.now() - 1_000),
    );

    const res = await verifyRequest(token);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_EXPIRED_TOKEN');
  });

  it('is single-use — the same token cannot verify twice', async () => {
    const token = await issueVerificationToken(await userId(signupPayload.email));

    const first = await verifyRequest(token);
    expect(first.status).toBe(200);

    // account is verified and the token is consumed; a replay finds no record
    const second = await verifyRequest(token);
    expect(second.status).toBe(401);
    expect(second.body.error.code).toBe('INVALID_EXPIRED_TOKEN');
  });

  it('invalidates the previous link when a new verification token is issued', async () => {
    // drive the real issue path (resend) twice so the second supersedes the first
    const resend = () =>
      request(app).post('/api/v1/auth/resend-verification').send({ email: signupPayload.email });

    await resend();
    const firstToken = tokenFromEnqueuedEmail(0);

    await resend();
    const secondToken = tokenFromEnqueuedEmail(1);

    // the superseded link no longer works...
    const stale = await verifyRequest(firstToken);
    expect(stale.status).toBe(401);

    // ...only the most recently issued one does
    const fresh = await verifyRequest(secondToken);
    expect(fresh.status).toBe(200);
  });

  it('rejects an already-verified account with 409', async () => {
    await setVerified(signupPayload.email, true);
    const token = await issueVerificationToken(await userId(signupPayload.email));

    const res = await verifyRequest(token);

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
    expect(enqueueEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(enqueueEmail).mock.calls[0][0].subject).toBe('Verify your email');
  });

  it('sends nothing for an already-verified account, but returns the same 200', async () => {
    await setVerified(signupPayload.email, true);

    const res = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: signupPayload.email });

    expect(res.status).toBe(200);
    expect(enqueueEmail).not.toHaveBeenCalled();
  });

  it('sends nothing for an unregistered email, but returns the same 200 (no enumeration)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(enqueueEmail).not.toHaveBeenCalled();
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
