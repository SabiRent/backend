import type { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import type { ZodTypeAny } from 'zod';
import { ZodError } from 'zod';

const formatPath = (path: (string | number | symbol)[]) => {
  if (!path.length) return 'error';
  return path
    .map((segment) => (typeof segment === 'number' ? `[${segment}]` : String(segment)))
    .join('.');
};

export const validateSchema = (schema: ZodTypeAny, reqType: 'query' | 'body' = 'body') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dataToValidate = reqType === 'body' ? req.body : req.query;
      const parsed = await schema.parseAsync(dataToValidate);

      if (reqType === 'body') {
        req.body = parsed;
      } else {
        // req.query itself can't be reassigned or reliably mutated in place under
        // Express 5 (see the note on Request.validatedQuery in express.d.ts) — the
        // coerced/defaulted result goes here instead, and handlers read from it.
        req.validatedQuery = parsed as Record<string, unknown>;
      }

      next();
    } catch (err: unknown) {
      if (err instanceof ZodError) {
        const errorsObject = err.issues.reduce<Record<string, string>>((acc, issue) => {
          acc[formatPath(issue.path)] = issue.message;
          return acc;
        }, {});

        res.status(StatusCodes.UNPROCESSABLE_ENTITY).json({
          success: false,
          errors: errorsObject,
        });
        return;
      }

      res.status(StatusCodes.UNPROCESSABLE_ENTITY).json({
        success: false,
        error: err instanceof Error ? err.message : 'Validation failed',
      });
    }
  };
};
