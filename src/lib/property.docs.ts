import { registry } from '@/lib/open-api-registry';
import {
  errorResponseSchema,
  messageOnlyResponseSchema,
  successResponseSchema,
  validationErrorResponseSchema,
} from '@/lib/response.docs';
import { z } from '@/lib/zod';
import {
  createPropertySchema,
  listPropertiesQuerySchema,
  updatePropertySchema,
} from '@/validations/property.validation';

const propertyAddressResponseSchema = z
  .object({
    street: z.string(),
    city: z.string(),
    state: z.string().optional(),
    country: z.string().optional(),
  })
  .openapi('PropertyAddressResponse');

const propertyDataSchema = z.object({
  id: z.string().openapi({ example: '6a60b8659c16fbcbeab13e49' }),
  owner: z.string().openapi({ example: '6a60b6659c16fbcbeab13e48' }),
  name: z.string().openapi({ example: 'Sunshine Apartments' }),
  address: propertyAddressResponseSchema,
  unitCount: z.number().openapi({ example: 12 }),
  description: z.string().optional().openapi({ example: 'A 12-unit apartment block in Lekki' }),
  image: z
    .string()
    .optional()
    .openapi({ example: 'https://res.cloudinary.com/demo/image/upload/v1/properties/abc.png' }),
  createdAt: z.string().openapi({ example: '2026-07-20T10:46:15.836Z' }),
  updatedAt: z.string().openapi({ example: '2026-07-20T10:46:15.836Z' }),
});

const propertyResponseSchema = successResponseSchema('PropertyResponse', propertyDataSchema);

const propertyListResponseSchema = z
  .object({
    success: z.literal(true),
    properties: z.array(propertyDataSchema),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
    }),
  })
  .openapi('PropertyListResponse');

// Documented as multipart/form-data (not JSON) because property creation/update accepts an
// image file alongside the other fields. Reuses createPropertySchema/updatePropertySchema
// directly — property.validation.ts is the single source of truth for the request shape —
// extended only with `image`, which Multer handles separately from req.body and so was
// never part of the Zod schema to begin with.
const imageFieldSchema = z.string().optional().openapi({
  type: 'string',
  format: 'binary',
  description: 'Property photo — jpeg/png/webp, max 5MB',
});

const propertyFormSchema = createPropertySchema
  .extend({ image: imageFieldSchema })
  .openapi('PropertyForm');

const updatePropertyFormSchema = updatePropertySchema
  .extend({ image: imageFieldSchema })
  .openapi('UpdatePropertyForm');

const idParam = z.object({ id: z.string().openapi({ example: '6a60b8659c16fbcbeab13e49' }) });

const bearerAuth = [{ bearerAuth: [] }];

export const registerPropertyDocs = () => {
  registry.registerPath({
    method: 'post',
    path: '/api/v1/properties',
    tags: ['Properties'],
    summary: 'Create a property owned by the logged-in landlord',
    security: bearerAuth,
    request: {
      body: { content: { 'multipart/form-data': { schema: propertyFormSchema } } },
    },
    responses: {
      '201': {
        description: 'Property created successfully',
        content: { 'application/json': { schema: propertyResponseSchema } },
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
    method: 'get',
    path: '/api/v1/properties',
    tags: ['Properties'],
    summary: 'List properties — landlords see only their own, admins/super-admins see all',
    security: bearerAuth,
    request: {
      query: listPropertiesQuerySchema,
    },
    responses: {
      '200': {
        description: 'Paginated list of properties',
        content: { 'application/json': { schema: propertyListResponseSchema } },
      },
      '401': {
        description: 'Missing or invalid access token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/properties/{id}',
    tags: ['Properties'],
    summary: 'Get a single property by ID (owner or admin only)',
    security: bearerAuth,
    request: { params: idParam },
    responses: {
      '200': {
        description: 'Property fetched successfully',
        content: { 'application/json': { schema: propertyResponseSchema } },
      },
      '400': {
        description: 'Invalid property ID format',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '401': {
        description: 'Missing or invalid access token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '404': {
        description:
          "No property with that ID, or it belongs to someone else — deliberately identical either way so a non-owner can't tell which one it is",
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/properties/{id}',
    tags: ['Properties'],
    summary: 'Update a property (owner or admin only) — optionally replaces the image',
    security: bearerAuth,
    request: {
      params: idParam,
      body: { content: { 'multipart/form-data': { schema: updatePropertyFormSchema } } },
    },
    responses: {
      '200': {
        description: 'Property updated successfully',
        content: { 'application/json': { schema: propertyResponseSchema } },
      },
      '400': {
        description: 'Invalid property ID format',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '401': {
        description: 'Missing or invalid access token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '404': {
        description:
          "No property with that ID, or it belongs to someone else — deliberately identical either way so a non-owner can't tell which one it is",
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '422': {
        description: 'Validation error',
        content: { 'application/json': { schema: validationErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/properties/{id}',
    tags: ['Properties'],
    summary: 'Delete a property (owner or admin only)',
    security: bearerAuth,
    request: { params: idParam },
    responses: {
      '200': {
        description: 'Property deleted successfully',
        content: { 'application/json': { schema: messageOnlyResponseSchema } },
      },
      '400': {
        description: 'Invalid property ID format',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '401': {
        description: 'Missing or invalid access token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '404': {
        description:
          "No property with that ID, or it belongs to someone else — deliberately identical either way so a non-owner can't tell which one it is",
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });
};
