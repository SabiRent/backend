import { redisConnection } from '@/config/redis.config';
import type { EmailJobData } from '@/types/email.types';
import { Queue, type JobsOptions } from 'bullmq';

export const EMAIL_QUEUE_NAME = 'email';
export const SEND_EMAIL_JOB = 'send-email';

/**
 * The producer side of the email pipeline. Controllers call {@link enqueueEmail}
 * and return immediately — the request/response cycle never waits on SMTP.
 *
 * `attempts` + exponential `backoff` give free retries: a transient SMTP failure
 * is retried 3 times (5s, 10s, 20s) before the job is parked in the failed set.
 */
export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 1_000 },
  },
});

/** Enqueue an email for asynchronous delivery. */
export const enqueueEmail = (data: EmailJobData, opts?: JobsOptions) =>
  emailQueue.add(SEND_EMAIL_JOB, data, opts);
