import redisClient from '@/config/redis.config';
import { disconnectDB } from '@/db';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';

let mongoServer: MongoMemoryServer | undefined;

beforeAll(async () => {
  // Use a provided DATABASE_URL (CI / docker-compose) when present, otherwise
  // spin up an in-memory MongoDB so the suite runs with no external services.
  if (process.env.DATABASE_URL) {
    await mongoose.connect(process.env.DATABASE_URL);
  } else {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  }
});

afterEach(async () => {
  const collections = mongoose.connection.collections;

  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
  await redisClient.flushdb();
});

afterAll(async () => {
  await disconnectDB();
  await mongoServer?.stop();
  await redisClient.quit();
});
