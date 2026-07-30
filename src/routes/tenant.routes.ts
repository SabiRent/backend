import {
  createTenantHandler,
  deleteTenantHandler,
  getTenantByIdHandler,
  listTenantsHandler,
  updateTenantHandler,
} from '@/controllers/tenant.controller';
import { authenticate } from '@/middlewares/authentication.middleware';
import { validateSchema } from '@/middlewares/validation.middeware';
import {
  createTenantSchema,
  listTenantsQuerySchema,
  updateTenantSchema,
} from '@/validations/tenant.validation';
import { Router } from 'express';

const router = Router();

router.use(authenticate);

router.post('/', validateSchema(createTenantSchema), createTenantHandler);
router.get('/', validateSchema(listTenantsQuerySchema, 'query'), listTenantsHandler);
router.get('/:id', getTenantByIdHandler);
router.patch('/:id', validateSchema(updateTenantSchema), updateTenantHandler);
router.delete('/:id', deleteTenantHandler);

export default router;
