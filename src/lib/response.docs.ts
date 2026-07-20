import { z } from '@/lib/zod';

export const errorResponseSchema = z
  .object({
    success: z.literal(false),
    error: z.object({
      message: z.string(),
      code: z.string(),
    }),
  })
  .openapi('ErrorResponse');

export const validationErrorResponseSchema = z
  .object({
    success: z.literal(false),
    errors: z.record(z.string(), z.string()),
  })
  .openapi('ValidationErrorResponse');

export const successResponseSchema = <T extends z.ZodTypeAny>(name: string, dataSchema?: T) =>
  (dataSchema
    ? z.object({ success: z.literal(true), message: z.string(), data: dataSchema })
    : z.object({ success: z.literal(true), message: z.string() })
  ).openapi(name);

export const messageOnlyResponseSchema = successResponseSchema('MessageOnlyResponse');
