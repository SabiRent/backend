import { ALLOWED_ORIGIN, API_BASE_URL } from '@/config/env.config';

export const allowedOrigins = [...ALLOWED_ORIGIN.split(' ').filter(Boolean), API_BASE_URL];

export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
};
