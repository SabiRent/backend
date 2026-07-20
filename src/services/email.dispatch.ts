import { CLIENT_URL } from '@/config/env.config';
import { enqueueEmail } from '@/queues/email.queue';
import { renderEmailTemplate } from '@/services/email-template.service';

/**
 * High-level email builders (producer side): render a template and drop the
 * email on the queue. They take their data as plain params, so they're fully
 * decoupled from auth — a caller just supplies a name / email / token.
 */

export const sendVerificationEmail = async (params: {
  to: string;
  fullName: string;
  token: string;
}) => {
  const verifyLink = `${CLIENT_URL}/verify-email?token=${params.token}`;
  const html = await renderEmailTemplate('verify-email', {
    fullName: params.fullName,
    verifyLink,
  });
  return enqueueEmail({
    to: params.to,
    subject: 'Verify your email',
    html,
  });
};

export const sendWelcomeEmail = async (params: { to: string; fullName: string }) => {
  const html = await renderEmailTemplate('welcome', { fullName: params.fullName });
  return enqueueEmail({
    to: params.to,
    subject: 'Welcome to MyCompound',
    html,
  });
};

export const sendPasswordResetEmail = async (params: {
  to: string;
  fullName: string;
  token: string;
}) => {
  const resetLink = `${CLIENT_URL}/reset-password?token=${params.token}`;
  const html = await renderEmailTemplate('reset-password', {
    fullName: params.fullName,
    resetLink,
  });
  return enqueueEmail({
    to: params.to,
    subject: 'Reset your MyCompound password',
    html,
  });
};
