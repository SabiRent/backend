import { JWT_REFRESH_SECRET } from '@/config/env.config';
import argon2 from 'argon2';
import crypto from 'node:crypto';

// pinned explicitly so a future argon2 upgrade can't silently change hashing strength
const PASSWORD_HASH_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 2 ** 16,
  timeCost: 3,
};

export const hashPassword = (password: string) => argon2.hash(password, PASSWORD_HASH_OPTIONS);

// Refresh tokens are high-entropy JWTs, not guessable secrets — a slow,
// memory-hard hash (argon2) buys nothing here and just adds latency. A keyed
// HMAC is the right tool: fast, deterministic, and a DB leak still can't be
// turned back into a usable token without JWT_REFRESH_SECRET.
export const hashRefreshToken = (token: string) =>
  crypto.createHmac('sha256', JWT_REFRESH_SECRET).update(token).digest('hex');

export const verifyRefreshToken = (token: string, hash: string) => {
  const candidate = Buffer.from(hashRefreshToken(token));
  const stored = Buffer.from(hash);

  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
};

// A high-entropy, URL-safe token for one-time links (email verification, password
// reset). Random rather than a JWT so the server holds the authority: the token
// only "exists" while its hash is in the DB, so it can be invalidated and consumed.
export const generateToken = () => crypto.randomBytes(32).toString('hex');

// Store/compare tokens by their keyed HMAC — a DB leak can't be reversed into a
// usable token without the secret. Deterministic, so lookup is a plain equality
// match on the indexed hash.
export const hashToken = (token: string, secret: string) =>
  crypto.createHmac('sha256', secret).update(token).digest('hex');

const DURATION_UNITS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

// Converts a short duration string ("15m", "1d", "7d", or a bare number of ms)
// into milliseconds, so a token's `expiresAt` can be derived from the same
// *_EXPIRES_IN env strings the JWT signer already consumes.
export const parseDuration = (value: string): number => {
  const match = /^(\d+)\s*(ms|s|m|h|d|w)?$/.exec(value.trim());

  if (!match) {
    throw new Error(`Invalid duration: "${value}"`);
  }

  return Number(match[1]) * DURATION_UNITS[match[2] ?? 'ms'];
};

// Escapes regex metacharacters in free-text search input before it's used to build a
// MongoDB regex filter — without this, a search term like "a+" or "(" would either throw
// as an invalid pattern or match unintended documents.
export const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
