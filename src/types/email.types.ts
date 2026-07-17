/** Payload for a single queued email job. Provider-agnostic. */
export interface EmailJobData {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  /** Overrides the default MAIL_FROM sender when provided. */
  from?: string;
}
