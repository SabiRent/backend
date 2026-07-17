import redisClient from '@/config/redis.config';
import { RateLimiterRedis } from 'rate-limiter-flexible';

const FIFTEEN_MINUTES_IN_SECONDS = 15 * 60;

export const loginRateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'login_fail',
  points: 5,
  duration: FIFTEEN_MINUTES_IN_SECONDS,
  blockDuration: FIFTEEN_MINUTES_IN_SECONDS,
});
