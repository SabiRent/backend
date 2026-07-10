/* eslint-disable @typescript-eslint/no-explicit-any */

import { corsOptions } from '@/config/cors.config';
import { httpLoggerConfig } from '@/config/logger.config';
import credentials from '@/middlewares/credentials.middleware';
import errorHandler from '@/middlewares/error-handler.middleware';
import router from '@/routes';
import type { CreateAppOptions } from '@/types';
import type { CustomError } from '@/types/error.types';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { StatusCodes } from 'http-status-codes';
import { pinoHttp } from 'pino-http';

export async function createApp(options: CreateAppOptions = {}) {
  const app = express();

  // middlewares
  app.use(pinoHttp(httpLoggerConfig));
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as any).rawBody = buf.toString();
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(credentials);
  app.use(helmet());
  app.use(cors(corsOptions));
  app.set('trust proxy', true);

  // routes
  app.use('/api/v1', router);

  if (options.enableDocs) {
    const swaggerUi = await import('swagger-ui-express');
    const { generateOpenApiSpec } = await import('@/lib/open-api');

    const spec = generateOpenApiSpec();
    app.get('/docs.json', (_req, res) => {
      res.status(StatusCodes.OK).json(spec);
    });

    app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));
    app.get('/', (_req, res) => {
      res.redirect('/docs');
    });
  }

  app.get('/health', (_req, res) => {
    res.status(StatusCodes.OK).json({ status: 'ok' });
  });

  app.use((req, _res, next) => {
    const err: CustomError = new Error(`Cannot ${req.method} ${req.originalUrl}`);
    err.statusCode = StatusCodes.NOT_FOUND;
    next(err);
  });

  app.use(errorHandler);

  return app;
}
