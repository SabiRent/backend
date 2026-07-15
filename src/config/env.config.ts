import dotenv from 'dotenv';

if (!process.env.JWT_ACCESS_SECRET) {
  dotenv.config();
}

export const NODE_ENV = process.env.NODE_ENV || 'development';
export const PORT = process.env.PORT || 8000;
export const DATABASE_URL = process.env.DATABASE_URL || '';
export const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '';
export const API_BASE_URL = process.env.API_BASE_URL || '';

// JWT
export const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access_secret';
export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh_secret';
export const JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
export const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// Cookie
export const COOKIE_SECRET = process.env.COOKIE_SECRET || 'cookie_secret';

// Mail
export const MAIL_HOST = process.env.MAIL_HOST || '';
export const MAIL_PORT = Number(process.env.MAIL_PORT) || 587;
export const MAIL_USER = process.env.MAIL_USER || '';
export const MAIL_PASS = process.env.MAIL_PASS || '';
export const MAIL_FROM = process.env.MAIL_FROM || '';

// Reset Password
export const RESET_TOKEN_SECRET = process.env.RESET_TOKEN_SECRET || 'reset_secret';
export const RESET_TOKEN_EXPIRES_IN = process.env.RESET_TOKEN_EXPIRES_IN || '15m';
export const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

// Redis
export const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
