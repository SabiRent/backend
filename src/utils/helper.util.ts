import { MAIL_FROM } from '@/config/env.config';
import transporter from '@/config/mail.config';
import ejs from 'ejs';
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
