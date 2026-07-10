import { ALLOWED_ORIGIN } from '@/config/env.config';
import dotenv from 'dotenv';
dotenv.config();

export const allowedOrigins = ALLOWED_ORIGIN.split(' ');

export const corsOptions = {
  origin: (origin: string | undefined, callback: any) => {
    if (allowedOrigins.indexOf(origin as string) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
};
