import { JWT_REFRESH_SECRET, MAIL_FROM } from '@/config/env.config';
import transporter from '@/config/mail.config';
import argon2 from 'argon2';
import ejs from 'ejs';
import crypto from 'node:crypto';
import path from 'node:path';

interface SendEmailOptions {
  to: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
}

export const sendEmail = async ({ to, subject, template, data }: SendEmailOptions) => {
  const templatePath = path.join(import.meta.dirname, '..', 'templates', template);
  const html = await ejs.renderFile(templatePath, data);

  await transporter.sendMail({
    from: MAIL_FROM,
    to,
    subject,
    html: html as string,
  });
};

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
