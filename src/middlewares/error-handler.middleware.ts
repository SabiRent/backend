import { NODE_ENV } from '@/config/env.config';
import { NodeEnv } from '@/constants';
import { ERROR_MESSAGE } from '@/constants/message';
import type { ErrorRequestHandler } from 'express';
import { getReasonPhrase, StatusCodes } from 'http-status-codes';

interface ErrorResponse {
  success: boolean;
  error: { message: string; code: string; stack?: string };
}

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const isProduction = NODE_ENV === NodeEnv.PRODUCTION || NODE_ENV === NodeEnv.STAGING;

  // Normalise status code — multer LIMIT_FILE_SIZE has no statusCode
  const statusCode: number = err.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR;

  // Normalise message
  const message =
    err.isOperational || statusCode < 500 ? err.message : ERROR_MESSAGE.INTERNAL_SERVER_ERROR;

  const errorResponse: ErrorResponse = {
    success: false,
    error: {
      message,
      code: err.code ?? getReasonPhrase(statusCode),
      ...(!isProduction && err.stack && { stack: err.stack }),
    },
  };

  // Log — all errors in dev, only 5xx in production
  if (isProduction) {
    if (statusCode >= 500) {
      console.error('[Error]', {
        path: req.path,
        method: req.method,
        statusCode,
        errorCode: err.code,
        originalMessage: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  } else {
    console.error('[Error]', err);
  }

  res.removeHeader('x-powered-by');
  res.status(statusCode).set(NO_CACHE_HEADERS).json(errorResponse);
};

export default errorHandler;
