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

/**
 * Single source of truth for email templates. Adding a template is one entry
 * here — the `EmailTemplate` type is derived from these keys via `keyof typeof`,
 * so there is no separate union to keep in sync however many templates we add.
 */
const TEMPLATE_FILES = {
  welcome: 'welcome.temp.ejs',
  'reset-password': 'reset-password.temp.ejs',
  'verify-email': 'verify-email.temp.ejs',
} as const;

export type EmailTemplate = keyof typeof TEMPLATE_FILES;

export const renderEmailTemplate = (
  template: EmailTemplate,
  data: Record<string, unknown>,
): Promise<string> => {
  const file = path.join(TEMPLATES_DIR, TEMPLATE_FILES[template]);
  return ejs.renderFile(file, data);
};
