import { OccupancyStatus } from '@/constants/occupancy-status';
import { RentInterval } from '@/constants/rent-interval';
import { z } from '@/lib/zod';

export const createUnitSchema = z
  .object({
    property: z
      .string({ error: 'Property is required' })
      .openapi({ example: '6a60b8659c16fbcbeab13e49' }),
    name: z
      .string({ error: 'Unit name is required' })
      .trim()
      .min(1, 'Unit name is required')
      .openapi({ example: 'Unit 1A' }),
    occupancyStatus: z
      .enum(OccupancyStatus)
      .optional()
      .default(OccupancyStatus.VACANT)
      .openapi({ example: OccupancyStatus.VACANT }),
    rentAmount: z.coerce
      .number({ error: 'Rent amount is required' })
      .min(0, 'Rent amount cannot be negative')
      .openapi({ example: 500000 }),
    rentInterval: z
      .enum(RentInterval)
      .optional()
      .default(RentInterval.YEARLY)
      .openapi({ example: RentInterval.YEARLY }),
  })
  .openapi('CreateUnitInput');

export type CreateUnitInput = z.infer<typeof createUnitSchema>;

export const updateUnitSchema = createUnitSchema
  .omit({ property: true })
  .partial()
  .openapi('UpdateUnitInput');

export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;

export const listUnitsQuerySchema = z
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
    search: z
      .string()
      .trim()
      .min(1, 'Search term cannot be empty')
      .optional()
      .openapi({ example: 'Unit 1A' }),
    occupancyStatus: z.enum(OccupancyStatus).optional(),
    sortBy: z
      .enum(['name', 'createdAt', 'rentAmount'])
      .optional()
      .default('createdAt')
      .openapi({ example: 'createdAt' }),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc').openapi({ example: 'desc' }),
  })
  .openapi('ListUnitsQuery');

export type ListUnitsQuery = z.infer<typeof listUnitsQuerySchema>;
