import { SUCCESS_MESSAGE } from '@/constants/message';
import {
  createUnit,
  deleteUnit,
  getUnitById,
  listUnits,
  updateUnit,
} from '@/services/unit.service';
import type {
  CreateUnitInput,
  ListUnitsQuery,
  UpdateUnitInput,
} from '@/validations/unit.validation';
import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

export const createUnitHandler = async (
  req: Request<unknown, unknown, CreateUnitInput>,
  res: Response,
) => {
  const unit = await createUnit(req.user!.id, req.user!.role, req.body);

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: SUCCESS_MESSAGE.CREATED,
    data: unit,
  });
};

export const listUnitsHandler = async (req: Request, res: Response) => {
  const { page, limit, property, search, occupancyStatus, sortBy, sortOrder } =
    req.validatedQuery as unknown as ListUnitsQuery;

  const result = await listUnits(
    req.user!.id,
    req.user!.role,
    page,
    limit,
    property,
    search,
    occupancyStatus,
    sortBy,
    sortOrder,
  );

  res.status(StatusCodes.OK).json({ success: true, ...result });
};

export const getUnitByIdHandler = async (req: Request<{ id: string }>, res: Response) => {
  const unit = await getUnitById(req.params.id, req.user!.id, req.user!.role);

  res.status(StatusCodes.OK).json({ success: true, data: unit });
};

export const updateUnitHandler = async (
  req: Request<{ id: string }, unknown, UpdateUnitInput>,
  res: Response,
) => {
  const unit = await updateUnit(req.params.id, req.user!.id, req.user!.role, req.body);

  res.status(StatusCodes.OK).json({
    success: true,
    message: SUCCESS_MESSAGE.UPDATED,
    data: unit,
  });
};

export const deleteUnitHandler = async (req: Request<{ id: string }>, res: Response) => {
  await deleteUnit(req.params.id, req.user!.id, req.user!.role);

  res.status(StatusCodes.OK).json({
    success: true,
    message: SUCCESS_MESSAGE.DELETED,
  });
};
