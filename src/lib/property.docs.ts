import { PropertyType } from '@/constants/property-type';
import { registry } from '@/lib/open-api-registry';
import {
  errorResponseSchema,
  messageOnlyResponseSchema,
  successResponseSchema,
  validationErrorResponseSchema,
} from '@/lib/response.docs';
import { z } from '@/lib/zod';

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
  type: z.string().openapi({ example: PropertyType.RESIDENTIAL }),
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
// image file alongside the other fields. `address` travels as a JSON-encoded string field —
// multipart requests can't carry nested objects natively, so the client stringifies it and
// the server parses it back out (see the `z.preprocess` step in property.validation.ts).
const propertyFormSchema = z
  .object({
    name: z.string().openapi({ example: 'Sunshine Apartments' }),
    address: z.string().openapi({
      description: 'JSON-encoded address object',
      example: '{"street":"12 Palm Street","city":"Lagos","state":"Lagos"}',
    }),
    type: z
      .enum(Object.values(PropertyType))
      .optional()
      .openapi({ example: PropertyType.RESIDENTIAL }),
    unitCount: z.string().openapi({ example: '12' }),
    description: z.string().optional().openapi({ example: 'A 12-unit apartment block in Lekki' }),
    image: z.string().optional().openapi({
      type: 'string',
      format: 'binary',
      description: 'Property photo — jpeg/png/webp, max 5MB',
    }),
  })
  .openapi('PropertyForm');

const updatePropertyFormSchema = propertyFormSchema.partial().openapi('UpdatePropertyForm');

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
      query: z.object({
        page: z.string().optional().openapi({ example: '1' }),
        limit: z.string().optional().openapi({ example: '20' }),
      }),
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
      '403': {
        description: 'Logged in, but not this property’s owner (and not an admin)',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '404': {
        description: 'No property with that ID',
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
      '403': {
        description: 'Logged in, but not this property’s owner (and not an admin)',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '404': {
        description: 'No property with that ID',
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
      '403': {
        description: 'Logged in, but not this property’s owner (and not an admin)',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '404': {
        description: 'No property with that ID',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });
};
