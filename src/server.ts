import { createApp } from '@/app';
import { NODE_ENV, PORT } from '@/config/env.config';
import logger from '@/config/logger.config';
import { NodeEnv } from '@/constants';
import { connectDB, disconnectDB } from '@/db';

async function bootstrap() {
  const app = await createApp({
    enableDocs: NODE_ENV !== NodeEnv.PRODUCTION && NODE_ENV !== NodeEnv.TEST,
  });

  await connectDB();

  const server = app.listen(PORT, async () => {
    logger.info('app is running on port ' + PORT);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down...`);

    server.close(async () => {
      await disconnectDB();
      logger.info('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap();
