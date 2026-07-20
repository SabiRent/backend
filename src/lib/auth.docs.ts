import { registry } from '@/lib/open-api-registry';
import { z } from '@/lib/zod';
import {
  forgotPasswordSchema,
  loginSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
} from '@/validations/user.validation';

const errorResponseSchema = z
  .object({
    success: z.literal(false),
    error: z.object({
      message: z.string(),
      code: z.string(),
    }),
  })
  .openapi('ErrorResponse');

const validationErrorResponseSchema = z
  .object({
    success: z.literal(false),
    errors: z.record(z.string(), z.string()),
  })
  .openapi('ValidationErrorResponse');

const authUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.string(),
});

const successResponseSchema = <T extends z.ZodTypeAny>(name: string, dataSchema?: T) =>
  (dataSchema
    ? z.object({ success: z.literal(true), message: z.string(), data: dataSchema })
    : z.object({ success: z.literal(true), message: z.string() })
  ).openapi(name);

const signupResponseSchema = successResponseSchema(
  'SignupResponse',
  z.object({
    id: z.string(),
    fullName: z.string(),
    email: z.string(),
    role: z.string(),
    isVerified: z.boolean(),
  }),
);

const authTokenResponseSchema = successResponseSchema(
  'AuthTokenResponse',
  z.object({
    accessToken: z.string(),
    user: authUserSchema,
  }),
);

const messageOnlyResponseSchema = successResponseSchema('MessageOnlyResponse');

export const registerAuthDocs = () => {
  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/signup',
    tags: ['Auth'],
    summary: 'Create a new account and send an email-verification link',
    request: {
      body: { content: { 'application/json': { schema: signupSchema } } },
    },
    responses: {
      '201': {
        description:
          'Account created. A verification email is sent so the user can confirm their address before logging in. `isVerified` reflects the current state (true only when auto-verified outside production).',
        content: { 'application/json': { schema: signupResponseSchema } },
      },
      '409': {
        description: 'Email already registered',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '422': {
        description: 'Validation error',
        content: { 'application/json': { schema: validationErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/verify-email',
    tags: ['Auth'],
    summary: 'Verify an account using the token emailed at signup',
    request: {
      body: { content: { 'application/json': { schema: verifyEmailSchema } } },
    },
    responses: {
      '200': {
        description: 'Email verified successfully — a welcome email is sent',
        content: { 'application/json': { schema: messageOnlyResponseSchema } },
      },
      '401': {
        description: 'Invalid or expired verification token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '409': {
        description: 'Account is already verified',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '422': {
        description: 'Validation error',
        content: { 'application/json': { schema: validationErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/resend-verification',
    tags: ['Auth'],
    summary: 'Resend the email-verification link',
    request: {
      body: { content: { 'application/json': { schema: resendVerificationSchema } } },
    },
    responses: {
      '200': {
        description:
          'Always returns this response whether or not the email is registered or already verified, to avoid leaking account existence',
        content: { 'application/json': { schema: messageOnlyResponseSchema } },
      },
      '429': {
        description: 'Too many resend requests for this email — try again later',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '422': {
        description: 'Validation error',
        content: { 'application/json': { schema: validationErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/login',
    tags: ['Auth'],
    summary: 'Log in with email and password',
    request: {
      body: { content: { 'application/json': { schema: loginSchema } } },
    },
    responses: {
      '200': {
        description: 'Logged in successfully — sets an httpOnly refreshToken cookie',
        content: { 'application/json': { schema: authTokenResponseSchema } },
      },
      '401': {
        description: 'Invalid email or password',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '403': {
        description: 'Account is not verified or has been deactivated',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '429': {
        description: 'Too many failed attempts — account temporarily locked for 15 minutes',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '422': {
        description: 'Validation error',
        content: { 'application/json': { schema: validationErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/refresh',
    tags: ['Auth'],
    summary: 'Exchange the refreshToken cookie for a new access token (rotates the refresh token)',
    responses: {
      '200': {
        description: 'Token refreshed successfully',
        content: { 'application/json': { schema: authTokenResponseSchema } },
      },
      '401': {
        description: 'Missing, invalid, expired, or already-used refresh token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/logout',
    tags: ['Auth'],
    summary: 'Log out and revoke the current refresh token',
    responses: {
      '200': {
        description: 'Logged out successfully',
        content: { 'application/json': { schema: messageOnlyResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/forgot-password',
    tags: ['Auth'],
    summary: 'Request a password reset email',
    request: {
      body: { content: { 'application/json': { schema: forgotPasswordSchema } } },
    },
    responses: {
      '200': {
        description:
          'Always returns this response whether or not the email is registered, to avoid leaking account existence',
        content: { 'application/json': { schema: messageOnlyResponseSchema } },
      },
      '422': {
        description: 'Validation error',
        content: { 'application/json': { schema: validationErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/reset-password',
    tags: ['Auth'],
    summary: 'Reset password using the token emailed by /forgot-password',
    request: {
      body: { content: { 'application/json': { schema: resetPasswordSchema } } },
    },
    responses: {
      '200': {
        description: 'Password reset successfully — all existing sessions are invalidated',
        content: { 'application/json': { schema: messageOnlyResponseSchema } },
      },
      '401': {
        description: 'Invalid or expired reset token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '422': {
        description: 'Validation error',
        content: { 'application/json': { schema: validationErrorResponseSchema } },
      },
    },
  });
};
