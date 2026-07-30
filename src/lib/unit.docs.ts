import { registry } from '@/lib/open-api-registry';
import {
  errorResponseSchema,
  messageOnlyResponseSchema,
  successResponseSchema,
  validationErrorResponseSchema,
} from '@/lib/response.docs';
import { z } from '@/lib/zod';
import {
  createUnitSchema,
  listUnitsQuerySchema,
  updateUnitSchema,
} from '@/validations/unit.validation';

const unitPropertyResponseSchema = z
  .object({
    id: z.string().openapi({ example: '6a60b8659c16fbcbeab13e49' }),
    name: z.string().openapi({ example: 'Sunshine Apartments' }),
  })
  .openapi('UnitPropertyResponse');

const unitDataSchema = z.object({
  id: z.string().openapi({ example: '6a60b9659c16fbcbeab13e4a' }),
  property: unitPropertyResponseSchema,
  name: z.string().openapi({ example: 'Unit 1A' }),
  occupancyStatus: z.string().openapi({ example: 'vacant' }),
  tenant: z
    .string()
    .nullable()
    .openapi({ description: 'Null until Tenant management is implemented', example: null }),
  rentAmount: z.number().openapi({ example: 500000 }),
  rentInterval: z.string().openapi({ example: 'yearly' }),
  createdAt: z.string().openapi({ example: '2026-07-20T10:46:15.836Z' }),
  updatedAt: z.string().openapi({ example: '2026-07-20T10:46:15.836Z' }),
});

const unitResponseSchema = successResponseSchema('UnitResponse', unitDataSchema);

const unitListResponseSchema = z
  .object({
    success: z.literal(true),
    units: z.array(unitDataSchema),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
    }),
  })
  .openapi('UnitListResponse');

const idParam = z.object({ id: z.string().openapi({ example: '6a60b9659c16fbcbeab13e4a' }) });

const bearerAuth = [{ bearerAuth: [] }];

export const registerUnitDocs = () => {
  registry.registerPath({
    method: 'post',
    path: '/api/v1/units',
    tags: ['Units'],
    summary: 'Create a unit under a property owned by the logged-in landlord',
    security: bearerAuth,
    request: {
      body: { content: { 'application/json': { schema: createUnitSchema } } },
    },
    responses: {
      '201': {
        description: 'Unit created successfully',
        content: { 'application/json': { schema: unitResponseSchema } },
      },
      '401': {
        description: 'Missing or invalid access token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '404': {
        description: 'No property with that ID, or it belongs to someone else',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '409': {
        description: 'A unit with this name already exists for this property',
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
    path: '/api/v1/units',
    tags: ['Units'],
    summary:
      'List units — landlords see only units under their own properties, admins/super-admins see all',
    security: bearerAuth,
    request: {
      query: listUnitsQuerySchema,
    },
    responses: {
      '200': {
        description: 'Paginated list of units',
        content: { 'application/json': { schema: unitListResponseSchema } },
      },
      '401': {
        description: 'Missing or invalid access token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/units/{id}',
    tags: ['Units'],
    summary: "Get a single unit by ID (the unit's property owner or admin only)",
    security: bearerAuth,
    request: { params: idParam },
    responses: {
      '200': {
        description: 'Unit fetched successfully',
        content: { 'application/json': { schema: unitResponseSchema } },
      },
      '400': {
        description: 'Invalid unit ID format',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '401': {
        description: 'Missing or invalid access token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '404': {
        description:
          'No unit with that ID, or its property belongs to someone else — deliberately identical either way',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/units/{id}',
    tags: ['Units'],
    summary: "Update a unit (the unit's property owner or admin only)",
    security: bearerAuth,
    request: {
      params: idParam,
      body: { content: { 'application/json': { schema: updateUnitSchema } } },
    },
    responses: {
      '200': {
        description: 'Unit updated successfully',
        content: { 'application/json': { schema: unitResponseSchema } },
      },
      '400': {
        description: 'Invalid unit ID format',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '401': {
        description: 'Missing or invalid access token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '404': {
        description:
          'No unit with that ID, or its property belongs to someone else — deliberately identical either way',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '409': {
        description: 'A unit with this name already exists for this property',
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
    path: '/api/v1/units/{id}',
    tags: ['Units'],
    summary: "Delete a unit (the unit's property owner or admin only)",
    security: bearerAuth,
    request: { params: idParam },
    responses: {
      '200': {
        description: 'Unit deleted successfully',
        content: { 'application/json': { schema: messageOnlyResponseSchema } },
      },
      '400': {
        description: 'Invalid unit ID format',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '401': {
        description: 'Missing or invalid access token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '404': {
        description:
          'No unit with that ID, or its property belongs to someone else — deliberately identical either way',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });
};
