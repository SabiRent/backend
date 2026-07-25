import { z } from '@/lib/zod';

const addressObjectSchema = z
  .object({
    street: z.string({ error: 'Street is required' }).trim().min(1, 'Street is required'),
    city: z.string({ error: 'City is required' }).trim().min(1, 'City is required'),
    state: z.string().trim().optional(),
    country: z.string().trim().optional(),
  })
  .openapi('PropertyAddress');

// The create/update requests are multipart/form-data (because of the image upload), and
// multipart fields can't carry nested objects natively — the client has to JSON.stringify
// the address before sending it. This unwraps that string back into an object before the
// shape above validates it; a plain JSON request (address already an object) passes through untouched.
const addressSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}, addressObjectSchema);

export const createPropertySchema = z
  .object({
    name: z
      .string({ error: 'Property name is required' })
      .trim()
      .min(2, 'Property name must be at least 2 characters')
      .openapi({ example: 'Sunshine Apartments' }),
    address: addressSchema.openapi({
      type: 'string',
      description:
        'JSON-encoded address object — required keys: street, city (state/country optional)',
      example: '{"street":"12 Palm Street","city":"Lagos","state":"Lagos"}',
    }),
    unitCount: z.coerce
      .number({ error: 'Unit count is required' })
      .int('Unit count must be a whole number')
      .min(1, 'Unit count must be at least 1')
      .openapi({ example: 12 }),
    description: z
      .string()
      .trim()
      .optional()
      .openapi({ example: 'A 12-unit apartment block in Lekki Phase 1' }),
  })
  .openapi('CreatePropertyInput');

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

export const updatePropertySchema = createPropertySchema.partial().openapi('UpdatePropertyInput');

export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;

export const listPropertiesQuerySchema = z
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
  })
  .openapi('ListPropertiesQuery');

export type ListPropertiesQuery = z.infer<typeof listPropertiesQuerySchema>;
