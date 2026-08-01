import { SUCCESS_MESSAGE } from '@/constants/message';
import {
  createProperty,
  deleteProperty,
  getPropertyById,
  listProperties,
  updateProperty,
} from '@/services/property.service';
import { listUnits } from '@/services/unit.service';
import type {
  CreatePropertyInput,
  ListPropertiesQuery,
  UpdatePropertyInput,
} from '@/validations/property.validation';
import type { ListUnitsQuery } from '@/validations/unit.validation';
import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

export const createPropertyHandler = async (
  req: Request<unknown, unknown, CreatePropertyInput>,
  res: Response,
) => {
  const property = await createProperty(req.user!.id, req.body, req.file);

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: SUCCESS_MESSAGE.CREATED,
    data: property,
  });
};

export const listPropertiesHandler = async (req: Request, res: Response) => {
  const { page, limit, search, sortBy, sortOrder } =
    req.validatedQuery as unknown as ListPropertiesQuery;

  const result = await listProperties(
    req.user!.id,
    req.user!.role,
    page,
    limit,
    search,
    sortBy,
    sortOrder,
  );

  res.status(StatusCodes.OK).json({ success: true, ...result });
};

export const listPropertyUnitsHandler = async (req: Request<{ id: string }>, res: Response) => {
  const { page, limit, search, occupancyStatus, sortBy, sortOrder } =
    req.validatedQuery as unknown as ListUnitsQuery;

  const result = await listUnits(
    req.user!.id,
    req.user!.role,
    page,
    limit,
    req.params.id,
    search,
    occupancyStatus,
    sortBy,
    sortOrder,
  );

  res.status(StatusCodes.OK).json({ success: true, ...result });
};

export const getPropertyByIdHandler = async (req: Request<{ id: string }>, res: Response) => {
  const property = await getPropertyById(req.params.id, req.user!.id, req.user!.role);

  res.status(StatusCodes.OK).json({ success: true, data: property });
};

export const updatePropertyHandler = async (
  req: Request<{ id: string }, unknown, UpdatePropertyInput>,
  res: Response,
) => {
  const property = await updateProperty(
    req.params.id,
    req.user!.id,
    req.user!.role,
    req.body,
    req.file,
  );

  res.status(StatusCodes.OK).json({
    success: true,
    message: SUCCESS_MESSAGE.UPDATED,
    data: property,
  });
};

export const deletePropertyHandler = async (req: Request<{ id: string }>, res: Response) => {
  await deleteProperty(req.params.id, req.user!.id, req.user!.role);

  res.status(StatusCodes.OK).json({
    success: true,
    message: SUCCESS_MESSAGE.DELETED,
  });
};
