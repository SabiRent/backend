import { registry } from '@/lib/open-api-registry';
import {
  errorResponseSchema,
  messageOnlyResponseSchema,
  successResponseSchema,
  validationErrorResponseSchema,
} from '@/lib/response.docs';
import { z } from '@/lib/zod';
import {
  createTenantSchema,
  listTenantsQuerySchema,
  updateTenantSchema,
} from '@/validations/tenant.validation';

const tenantUnitResponseSchema = z
  .object({
    id: z.string().openapi({ example: '6a60b9659c16fbcbeab13e4a' }),
    name: z.string().openapi({ example: 'Unit 1A' }),
    property: z
      .object({
        id: z.string().openapi({ example: '6a60b8659c16fbcbeab13e49' }),
        name: z.string().openapi({ example: 'Sunshine Apartments' }),
      })
      .openapi('TenantUnitPropertyResponse'),
  })
  .openapi('TenantUnitResponse');

const tenantDataSchema = z.object({
  id: z.string().openapi({ example: '6a60ba659c16fbcbeab13e4b' }),
  unit: tenantUnitResponseSchema,
  fullName: z.string().openapi({ example: 'Ndubuisi Eze' }),
  phone: z.string().openapi({ example: '+2347050456329' }),
  email: z.string().optional().openapi({ example: 'ndubuisi@example.com' }),
  rentAmount: z.number().openapi({ example: 500000 }),
  paymentFrequency: z.string().openapi({ example: 'yearly' }),
  lastPaymentDate: z.string().openapi({ example: '2026-07-18T00:00:00.000Z' }),
  nextDueDate: z.string().openapi({ example: '2027-07-18T00:00:00.000Z' }),
  status: z.string().openapi({ example: 'active' }),
  createdAt: z.string().openapi({ example: '2026-07-20T10:46:15.836Z' }),
  updatedAt: z.string().openapi({ example: '2026-07-20T10:46:15.836Z' }),
});

const tenantResponseSchema = successResponseSchema('TenantResponse', tenantDataSchema);

const tenantListResponseSchema = z
  .object({
    success: z.literal(true),
    tenants: z.array(tenantDataSchema),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
    }),
  })
  .openapi('TenantListResponse');

const idParam = z.object({ id: z.string().openapi({ example: '6a60ba659c16fbcbeab13e4b' }) });

const bearerAuth = [{ bearerAuth: [] }];

export const registerTenantDocs = () => {
  registry.registerPath({
    method: 'post',
    path: '/api/v1/tenants',
    tags: ['Tenants'],
    summary: 'Create a tenant assigned to a unit owned by the logged-in landlord',
    security: bearerAuth,
    request: {
      body: { content: { 'application/json': { schema: createTenantSchema } } },
    },
    responses: {
      '201': {
        description: 'Tenant created successfully',
        content: { 'application/json': { schema: tenantResponseSchema } },
      },
      '401': {
        description: 'Missing or invalid access token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '404': {
        description: 'No unit with that ID, or it belongs to someone else',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '409': {
        description: 'This unit already has an active tenant',
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
    path: '/api/v1/tenants',
    tags: ['Tenants'],
    summary:
      'List tenants — landlords see only tenants under their own properties, admins/super-admins see all',
    security: bearerAuth,
    request: {
      query: listTenantsQuerySchema,
    },
    responses: {
      '200': {
        description: 'Paginated list of tenants',
        content: { 'application/json': { schema: tenantListResponseSchema } },
      },
      '401': {
        description: 'Missing or invalid access token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/tenants/{id}',
    tags: ['Tenants'],
    summary: "Get a single tenant by ID (the tenant's property owner or admin only)",
    security: bearerAuth,
    request: { params: idParam },
    responses: {
      '200': {
        description: 'Tenant fetched successfully',
        content: { 'application/json': { schema: tenantResponseSchema } },
      },
      '400': {
        description: 'Invalid tenant ID format',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '401': {
        description: 'Missing or invalid access token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '404': {
        description:
          'No tenant with that ID, or its property belongs to someone else — deliberately identical either way',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/tenants/{id}',
    tags: ['Tenants'],
    summary: "Update a tenant (the tenant's property owner or admin only)",
    security: bearerAuth,
    request: {
      params: idParam,
      body: { content: { 'application/json': { schema: updateTenantSchema } } },
    },
    responses: {
      '200': {
        description: 'Tenant updated successfully',
        content: { 'application/json': { schema: tenantResponseSchema } },
      },
      '400': {
        description: 'Invalid tenant ID format',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '401': {
        description: 'Missing or invalid access token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '404': {
        description:
          'No tenant with that ID, or its property belongs to someone else — deliberately identical either way',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '409': {
        description: 'This unit already has an active tenant',
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
    path: '/api/v1/tenants/{id}',
    tags: ['Tenants'],
    summary: "Delete a tenant (the tenant's property owner or admin only)",
    security: bearerAuth,
    request: { params: idParam },
    responses: {
      '200': {
        description: 'Tenant deleted successfully',
        content: { 'application/json': { schema: messageOnlyResponseSchema } },
      },
      '400': {
        description: 'Invalid tenant ID format',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '401': {
        description: 'Missing or invalid access token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '404': {
        description:
          'No tenant with that ID, or its property belongs to someone else — deliberately identical either way',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });
};
