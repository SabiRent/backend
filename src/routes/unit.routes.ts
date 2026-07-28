import {
  createUnitHandler,
  deleteUnitHandler,
  getUnitByIdHandler,
  listUnitsHandler,
  updateUnitHandler,
} from '@/controllers/unit.controller';
import { authenticate } from '@/middlewares/authentication.middleware';
import { validateSchema } from '@/middlewares/validation.middeware';
import {
  createUnitSchema,
  listUnitsQuerySchema,
  updateUnitSchema,
} from '@/validations/unit.validation';
import { Router } from 'express';

const router = Router();

router.use(authenticate);

router.post('/', validateSchema(createUnitSchema), createUnitHandler);
router.get('/', validateSchema(listUnitsQuerySchema, 'query'), listUnitsHandler);
router.get('/:id', getUnitByIdHandler);
router.patch('/:id', validateSchema(updateUnitSchema), updateUnitHandler);
router.delete('/:id', deleteUnitHandler);

export default router;
