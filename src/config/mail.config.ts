import { MAIL_HOST, MAIL_PASS, MAIL_PORT, MAIL_USER } from '@/config/env.config';
import nodemailer from 'nodemailer';

/**
 * Nodemailer SMTP transport. Provider-agnostic: point MAIL_* at Resend
 * (smtp.resend.com, user "resend", pass = API key), or any other SMTP provider,
 * and no application code changes.
 */
export const mailTransport = nodemailer.createTransport({
  host: MAIL_HOST,
  port: MAIL_PORT,
  secure: MAIL_PORT === 465, // 465 = implicit TLS; 587/2587 = STARTTLS
  auth: MAIL_USER ? { user: MAIL_USER, pass: MAIL_PASS } : undefined,
});
