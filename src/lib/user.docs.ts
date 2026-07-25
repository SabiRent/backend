import { registry } from '@/lib/open-api-registry';
import {
  errorResponseSchema,
  messageOnlyResponseSchema,
  successResponseSchema,
  validationErrorResponseSchema,
} from '@/lib/response.docs';
import { z } from '@/lib/zod';
import { changePasswordSchema, updateProfileSchema } from '@/validations/user.validation';

const userProfileSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string(),
  role: z.string(),
  isActive: z.boolean(),
  avatarUrl: z
    .string()
    .nullable()
    .openapi({ example: 'https://res.cloudinary.com/demo/image/upload/avatar.png' }),
  createdAt: z.string().openapi({ example: '2026-07-20T10:46:15.836Z' }),
});

// The avatar endpoint takes a file upload (multipart/form-data), not JSON.
const avatarUploadSchema = z
  .object({
    avatar: z.string().openapi({ type: 'string', format: 'binary' }),
  })
  .openapi('AvatarUploadInput');

const userProfileResponseSchema = successResponseSchema('UserProfileResponse', userProfileSchema);

const userListResponseSchema = z
  .object({
    success: z.literal(true),
    users: z.array(userProfileSchema),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
    }),
  })
  .openapi('UserListResponse');

const idParam = z.object({ id: z.string().openapi({ example: '6a5dfeddf0272b107453c960' }) });

const bearerAuth = [{ bearerAuth: [] }];

export const registerUserDocs = () => {
  registry.registerPath({
    method: 'get',
    path: '/api/v1/users/me',
    tags: ['Users'],
    summary: "Get the logged-in user's own profile",
    security: bearerAuth,
    responses: {
      '200': {
        description: 'Profile fetched successfully',
        content: { 'application/json': { schema: userProfileResponseSchema } },
      },
      '401': {
        description: 'Missing or invalid access token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/users/me',
    tags: ['Users'],
    summary: "Update the logged-in user's own profile (fullName only — email is locked)",
    security: bearerAuth,
    request: {
      body: { content: { 'application/json': { schema: updateProfileSchema } } },
    },
    responses: {
      '200': {
        description: 'Profile updated successfully',
        content: { 'application/json': { schema: userProfileResponseSchema } },
      },
      '401': {
        description: 'Missing or invalid access token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '422': {
        description: 'Validation error',
        content: { 'application/json': { schema: validationErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/users/me/password',
    tags: ['Users'],
    summary: 'Change password while logged in (requires current password)',
    security: bearerAuth,
    request: {
      body: { content: { 'application/json': { schema: changePasswordSchema } } },
    },
    responses: {
      '200': {
        description: 'Password updated successfully — all existing sessions are invalidated',
        content: { 'application/json': { schema: messageOnlyResponseSchema } },
      },
      '400': {
        description: 'New password is the same as the current password',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '401': {
        description: 'Missing/invalid access token, or current password is incorrect',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '422': {
        description: 'Validation error',
        content: { 'application/json': { schema: validationErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/users/me/avatar',
    tags: ['Users'],
    summary: "Upload or replace the logged-in user's profile image",
    security: bearerAuth,
    request: {
      body: {
        content: {
          'multipart/form-data': { schema: avatarUploadSchema },
        },
      },
    },
    responses: {
      '200': {
        description: 'Profile image updated successfully',
        content: { 'application/json': { schema: userProfileResponseSchema } },
      },
      '400': {
        description: 'No file was uploaded',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '401': {
        description: 'Missing or invalid access token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '415': {
        description: 'Unsupported file type (only JPEG, PNG, or WEBP images are allowed)',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/users',
    tags: ['Users'],
    summary: 'List all users (admin only)',
    security: bearerAuth,
    request: {
      query: z.object({
        page: z.string().optional().openapi({ example: '1' }),
        limit: z.string().optional().openapi({ example: '20' }),
      }),
    },
    responses: {
      '200': {
        description: 'Paginated list of users',
        content: { 'application/json': { schema: userListResponseSchema } },
      },
      '401': {
        description: 'Missing or invalid access token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '403': {
        description: 'Logged in, but not an admin',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/users/{id}',
    tags: ['Users'],
    summary: 'Get a single user by ID (admin only)',
    security: bearerAuth,
    request: { params: idParam },
    responses: {
      '200': {
        description: 'User fetched successfully',
        content: { 'application/json': { schema: userProfileResponseSchema } },
      },
      '400': {
        description: 'Invalid user ID format',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '401': {
        description: 'Missing or invalid access token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '403': {
        description: 'Logged in, but not an admin',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '404': {
        description: 'No user with that ID',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/users/{id}/deactivate',
    tags: ['Users'],
    summary: "Deactivate a user's account (admin only) — also revokes their active session",
    security: bearerAuth,
    request: { params: idParam },
    responses: {
      '200': {
        description: 'User deactivated successfully',
        content: { 'application/json': { schema: userProfileResponseSchema } },
      },
      '400': {
        description: 'Invalid user ID format',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '403': {
        description: 'Not an admin, or trying to deactivate your own account',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '404': {
        description: 'No user with that ID',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '409': {
        description: 'User is already deactivated',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/users/{id}/activate',
    tags: ['Users'],
    summary: "Reactivate a user's account (admin only)",
    security: bearerAuth,
    request: { params: idParam },
    responses: {
      '200': {
        description: 'User activated successfully',
        content: { 'application/json': { schema: userProfileResponseSchema } },
      },
      '400': {
        description: 'Invalid user ID format',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '403': {
        description: 'Not an admin',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '404': {
        description: 'No user with that ID',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '409': {
        description: 'User is already active',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });
};
