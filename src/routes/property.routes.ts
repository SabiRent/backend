import {
  createPropertyHandler,
  deletePropertyHandler,
  getPropertyByIdHandler,
  listPropertiesHandler,
  updatePropertyHandler,
} from '@/controllers/property.controller';
import { authenticate } from '@/middlewares/authentication.middleware';
import { uploadPropertyImage } from '@/middlewares/upload.middleware';
import { validateSchema } from '@/middlewares/validation.middeware';
import { createPropertySchema, updatePropertySchema } from '@/validations/property.validation';
import { Router } from 'express';

const router = Router();

router.use(authenticate);

// uploadPropertyImage runs first so it can parse the multipart body into req.body/req.file
// before validateSchema checks req.body's shape.
router.post('/', uploadPropertyImage, validateSchema(createPropertySchema), createPropertyHandler);
router.get('/', listPropertiesHandler);
router.get('/:id', getPropertyByIdHandler);
router.patch(
  '/:id',
  uploadPropertyImage,
  validateSchema(updatePropertySchema),
  updatePropertyHandler,
);
router.delete('/:id', deletePropertyHandler);

export default router;
