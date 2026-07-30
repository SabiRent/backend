import redisClient from '@/config/redis.config';
import { connectDB, disconnectDB } from '@/db';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';

beforeAll(async () => {
  await connectDB();

  // Unconditionally clears every collection's non-_id indexes before rebuilding
  // them from the current schemas. mongoose.syncIndexes() alone isn't reliable here:
  // MongoDB rejects a second index on an already-indexed key path even under a new
  // name, so a stale index left over from an earlier schema version (e.g. from a
  // local dev iteration) can permanently block its replacement from ever being
  // created — syncIndexes() doesn't detect that case as one it needs to fix.
  const db = mongoose.connection.db;
  if (db) {
    const existingCollections = await db.listCollections().toArray();
    await Promise.all(
      existingCollections.map(({ name }) => db.collection(name).dropIndexes()),
    );
  }

  await mongoose.syncIndexes();
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
