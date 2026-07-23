import { REDIS_URL } from '@/config/env.config';
import logger from '@/config/logger.config';
import type { ConnectionOptions } from 'bullmq';
import Redis from 'ioredis';

/**
 * BullMQ connection options, parsed from REDIS_URL.
 *
 * We hand BullMQ plain options (not a shared ioredis instance) for two reasons:
 *  1. BullMQ then owns each connection's lifecycle and closes it on shutdown.
 *  2. It avoids the duplicate-`ioredis` type clash — BullMQ ships its own copy,
 *     so passing an instance from the top-level `ioredis` fails to type-check.
 *
 * `maxRetriesPerRequest: null` is required by BullMQ's blocking commands.
 */
const url = new URL(REDIS_URL);

export const redisConnection: ConnectionOptions = {
  host: url.hostname,
  port: url.port ? Number(url.port) : 6379,
  username: url.username || undefined,
  password: url.password || undefined,
  ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  maxRetriesPerRequest: null,
};

/**
 * Shared ioredis client instance (used by the rate limiter). Kept separate from
 * the BullMQ connection above, which needs plain options rather than a client.
 */
const redisClient = new Redis(REDIS_URL, {
  enableOfflineQueue: false,
});

redisClient.on('connect', () => {
  logger.info('Redis client connected successfully');
});

redisClient.on('error', (err) => {
  logger.error(`Redis client error: ${err.message}`);
});

redisClient.on('close', () => {
  logger.info('Redis client connection closed');
});

export default redisClient;
