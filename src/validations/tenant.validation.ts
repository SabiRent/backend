import { PaymentFrequency } from '@/constants/payment-frequency';
import { TenantStatus } from '@/constants/tenant-status';
import { z } from '@/lib/zod';

export const createTenantSchema = z
  .object({
    unit: z.string({ error: 'Unit is required' }).openapi({ example: '6a60b9659c16fbcbeab13e4a' }),
    fullName: z
      .string({ error: 'Full name is required' })
      .trim()
      .min(2, 'Full name must be at least 2 characters')
      .openapi({ example: 'Ndubuisi Eze' }),
    phone: z
      .string({ error: 'Phone number is required' })
      .trim()
      .min(7, 'Phone number is too short')
      .openapi({ example: '+2347050456329' }),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Invalid email format')
      .optional()
      .openapi({ example: 'ndubuisi@example.com' }),
    rentAmount: z.coerce
      .number({ error: 'Rent amount is required' })
      .min(0, 'Rent amount cannot be negative')
      .openapi({ example: 500000 }),
    paymentFrequency: z
      .enum(PaymentFrequency, { error: 'Payment frequency is required' })
      .openapi({ example: PaymentFrequency.YEARLY }),
    lastPaymentDate: z.coerce
      .date({ error: 'Last payment date is required' })
      .openapi({ example: '2026-07-18T00:00:00.000Z' }),
    status: z
      .enum(TenantStatus)
      .optional()
      .default(TenantStatus.ACTIVE)
      .openapi({ example: TenantStatus.ACTIVE }),
  })
  .openapi('CreateTenantInput');

export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export const updateTenantSchema = createTenantSchema
  .omit({ unit: true })
  .partial()
  .openapi('UpdateTenantInput');

export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

export const listTenantsQuerySchema = z
  .object({
    page: z.coerce
      .number({ error: 'Page must be a number' })
      .int('Page must be a whole number')
      .min(1, 'Page must be at least 1')
      .optional()
      .default(1)
      .openapi({ example: 1 }),
    limit: z.coerce
      .number({ error: 'Limit must be a number' })
      .int('Limit must be a whole number')
      .min(1, 'Limit must be at least 1')
      .max(100, 'Limit cannot exceed 100')
      .optional()
      .default(20)
      .openapi({ example: 20 }),
    property: z.string().optional().openapi({ example: '6a60b8659c16fbcbeab13e49' }),
    unit: z.string().optional().openapi({ example: '6a60b9659c16fbcbeab13e4a' }),
    search: z
      .string()
      .trim()
      .min(1, 'Search term cannot be empty')
      .optional()
      .openapi({ example: 'Ndubuisi' }),
    status: z.enum(TenantStatus).optional(),
    sortBy: z
      .enum(['fullName', 'createdAt', 'nextDueDate', 'rentAmount'])
      .optional()
      .default('createdAt')
      .openapi({ example: 'createdAt' }),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc').openapi({ example: 'desc' }),
  })
  .openapi('ListTenantsQuery');

export type ListTenantsQuery = z.infer<typeof listTenantsQuerySchema>;
