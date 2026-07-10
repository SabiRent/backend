/* eslint-disable @typescript-eslint/no-explicit-any */
import { NODE_ENV } from '@/config/env.config';
import { NodeEnv } from '@/constants';

import pino from 'pino';
import type { Options } from 'pino-http';

const isDevelopment = NODE_ENV === NodeEnv.DEVELOPMENT;

function getClientIp(ip?: string) {
  if (!ip) return 'unknown';

  // IPv6 localhost
  if (ip === '::1') {
    return '127.0.0.1';
  }

  // Convert ::ffff:127.0.0.1 -> 127.0.0.1
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }

  return ip;
}

const logger = pino({
  level: isDevelopment ? 'debug' : 'info',

  base: {
    pid: process.pid,
  },

  timestamp: pino.stdTimeFunctions.isoTime,

  redact: {
    paths: [
      'password',
      'passwordHash',
      'confirmPassword',
      'token',
      'accessToken',
      'refreshToken',
      'authorization',
      'req.headers.authorization',
      'req.headers.cookie',
    ],

    censor: '[REDACTED]',
  },

  ...(isDevelopment && {
    transport: {
      target: 'pino-pretty',

      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname,req,res,responseTime',
        oneline: true,
      },
    },
  }),
});

export const httpLoggerConfig: Options = {
  logger,

  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      httpVersion: req.httpVersion,
      remoteAddress: getClientIp(req.ip),
    }),

    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },

  customSuccessMessage: (req, res, responseTime) =>
    `http: ${getClientIp((req as any).ip)} - ${req.method} ${req.url} HTTP/${req.httpVersion} ${res.statusCode} - ${responseTime} ms`,

  customErrorMessage: (req, res) =>
    `http: ${getClientIp((req as any).ip)} - ${req.method} ${req.url} HTTP/${req.httpVersion} ${res.statusCode}`,
};

export default logger;
