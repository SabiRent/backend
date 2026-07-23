import ejs from 'ejs';
import path from 'node:path';

const TEMPLATES_DIR = path.join(process.cwd(), 'templates');

export const TEMPLATE_FILES = {
  welcome: 'welcome.temp.ejs',
  resetPassword: 'reset-password.temp.ejs',
  verifyEmail: 'verify-email.temp.ejs',
} as const;

export type EmailTemplate = keyof typeof TEMPLATE_FILES;

export const renderEmailTemplate = (
  template: EmailTemplate,
  data: Record<string, unknown>,
): Promise<string> => {
  const file = path.join(TEMPLATES_DIR, TEMPLATE_FILES[template]);
  return ejs.renderFile(file, data);
};
