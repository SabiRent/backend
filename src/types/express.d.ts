import type { UserRole } from '../constants/user-role';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: UserRole;
      };
      // Express 5 made `req.query` a read-only getter that re-derives from the URL on
      // every access, so validateSchema('query') can no longer mutate it in place —
      // the coerced/defaulted result is stashed here instead. Cast at the read site
      // to the specific query schema's inferred type.
      validatedQuery?: Record<string, unknown>;
    }
  }
}
