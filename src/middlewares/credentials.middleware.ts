/* eslint-disable @typescript-eslint/no-explicit-any */
import { allowedOrigins } from '@/config/cors.config';
import type { RequestHandler } from 'express';

const credentials: RequestHandler = (req, res, next) => {
  const origin = req.headers.origin as string;

  if (allowedOrigins.includes(origin)) {
    (res.header as any)('Access-Control-Allow-Credentials', true);
  }

  next();
};

export default credentials;
