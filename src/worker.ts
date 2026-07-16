import logger from '@/config/logger.config';
import { createEmailWorker } from '@/queues/email.worker';

/**
 * Standalone worker process. Run separately from the API (`npm run worker`) so
 * email delivery is isolated from the request/response cycle and can be scaled
 * or restarted independently.
 */
const worker = createEmailWorker();

logger.info('Email worker started, waiting for jobs...');

const shutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down email worker...`);
  await worker.close();
  logger.info('Email worker closed');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
