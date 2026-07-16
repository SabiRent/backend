import ejs from 'ejs';
import path from 'node:path';

/**
 * Renders EJS email templates from src/templates into HTML strings.
 *
 * NOTE: templates are resolved from `src/templates` relative to the process cwd,
 * which works for `tsx` (dev/worker). For a bundled production build the template
 * files must be copied alongside the output — see the worker build TODO.
 */
const TEMPLATES_DIR = path.join(process.cwd(), 'src', 'templates');

export type EmailTemplate = 'welcome' | 'reset-password';

const TEMPLATE_FILES: Record<EmailTemplate, string> = {
  welcome: 'welcome.temp.ejs',
  'reset-password': 'reset-password.temp.ejs',
};

export const renderEmailTemplate = (
  template: EmailTemplate,
  data: Record<string, unknown>,
): Promise<string> => {
  const file = path.join(TEMPLATES_DIR, TEMPLATE_FILES[template]);
  return ejs.renderFile(file, data);
};
