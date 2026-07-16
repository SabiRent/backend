import logger from '@/config/logger.config';
import { redisConnection } from '@/config/redis.config';
import { EMAIL_QUEUE_NAME } from '@/queues/email.queue';
import { sendEmail } from '@/services/email.service';
import type { EmailJobData } from '@/types/email.types';
import { type Job, Worker } from 'bullmq';

const formatTo = (to: string | string[]) => (Array.isArray(to) ? to.join(', ') : to);

/**
 * The consumer side of the email pipeline. Pulls jobs off the queue and sends
 * them. Throwing here (a failed send) hands control back to BullMQ, which
 * applies the retry/backoff policy defined on the queue.
 *
 * Runs in its own process (see `src/worker.ts`) so email delivery is fully
 * decoupled from the API.
 */
export const createEmailWorker = (): Worker<EmailJobData> => {
  const worker = new Worker<EmailJobData>(
    EMAIL_QUEUE_NAME,
    async (job: Job<EmailJobData>) => {
      const info = await sendEmail(job.data);
      return { messageId: (info as { messageId?: string }).messageId };
    },
    {
      connection: redisConnection,
      concurrency: 5,
    },
  );

  worker.on('completed', (job) => {
    logger.info(`email job ${job.id} sent → ${formatTo(job.data.to)}`);
  });

  worker.on('failed', (job, err) => {
    logger.error(
      `email job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts.attempts}): ${err.message}`,
    );
  });

  worker.on('error', (err) => {
    logger.error(`email worker error: ${err.message}`);
  });

  return worker;
};
