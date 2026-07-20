import redisClient from '@/config/redis.config';
import { RateLimiterRedis } from 'rate-limiter-flexible';

const FIFTEEN_MINUTES_IN_SECONDS = 15 * 60;
const ONE_HOUR_IN_SECONDS = 60 * 60;

export const loginRateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'login_fail',
  points: 5,
  duration: FIFTEEN_MINUTES_IN_SECONDS,
  blockDuration: FIFTEEN_MINUTES_IN_SECONDS,
});

// Per-email cap on verification resends — blunts email-bombing abuse.
export const resendVerificationRateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'resend_verification',
  points: 3,
  duration: ONE_HOUR_IN_SECONDS,
  blockDuration: ONE_HOUR_IN_SECONDS,
});
