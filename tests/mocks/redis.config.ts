// Test-only replacement for src/config/redis.config.ts.
// Uses an in-memory ioredis-mock so tests never touch a real Redis (and the
// rate limiter + setup.ts flushdb() work in isolation per test).
import RedisMock from 'ioredis-mock';

const redisClient = new RedisMock();

// email.queue/worker import this; not exercised by the auth tests, but keep the
// shape so the module resolves.
export const redisConnection = { host: '127.0.0.1', port: 6379 };

export default redisClient;
