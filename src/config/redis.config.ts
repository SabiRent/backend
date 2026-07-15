import { REDIS_URL } from '@/config/env.config';
import Redis from 'ioredis';

const redisClient = new Redis(REDIS_URL, {
  enableOfflineQueue: false,
});

export default redisClient;
