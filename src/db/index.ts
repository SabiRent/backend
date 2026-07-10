import { DATABASE_URL } from '@/config/env.config';
import logger from '@/config/logger.config';
import mongoose from 'mongoose';

export const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(DATABASE_URL as string);
    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error('Error connecting to MongoDB: ' + error);
    process.exit(1);
  }
};

export const disconnectDB = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected successfully');
  } catch (error) {
    logger.error('Error disconnecting from MongoDB: ' + error);
  }
};
