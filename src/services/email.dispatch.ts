import { CLIENT_URL } from '@/config/env.config';
import { enqueueEmail } from '@/queues/email.queue';
import { renderEmailTemplate } from '@/services/email-template.service';

/**
 * High-level email builders (producer side): render a template and drop the
 * email on the queue. They take their data as plain params, so they're fully
 * decoupled from auth — a caller just supplies a name / email / token.
 */

export const sendWelcomeEmail = async (params: { to: string; name: string }) => {
  const html = await renderEmailTemplate('welcome', { name: params.name });
  return enqueueEmail({
    to: params.to,
    subject: 'Welcome to MyCompound',
    html,
  });
};

export const sendPasswordResetEmail = async (params: {
  to: string;
  name: string;
  token: string;
}) => {
  const resetUrl = `${CLIENT_URL}/reset-password?token=${params.token}`;
  const html = await renderEmailTemplate('reset-password', {
    name: params.name,
    resetUrl,
  });
  return enqueueEmail({
    to: params.to,
    subject: 'Reset your MyCompound password',
    html,
  });
};
