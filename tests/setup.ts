import redisClient from '@/config/redis.config';
import { connectDB, disconnectDB } from '@/db';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';

beforeAll(async () => {
  await connectDB();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;

  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
  await redisClient.flushdb();
});

afterAll(async () => {
  await disconnectDB();
  await redisClient.quit();
});
