import { MAIL_FROM } from '@/config/env.config';
import { mailTransport } from '@/config/mail.config';
import type { EmailJobData } from '@/types/email.types';

/**
 * Actually delivers an email via the SMTP transport. This is the unit of work
 * the queue worker runs — keep it side-effect-light so a failed send simply
 * throws and lets BullMQ retry.
 */
export const sendEmail = async (data: EmailJobData) => {
  return mailTransport.sendMail({
    from: data.from ?? MAIL_FROM,
    to: data.to,
    subject: data.subject,
    html: data.html,
    text: data.text,
  });
};
