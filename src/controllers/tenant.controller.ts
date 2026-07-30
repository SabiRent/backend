import { SUCCESS_MESSAGE } from '@/constants/message';
import {
  createTenant,
  deleteTenant,
  getTenantById,
  listTenants,
  updateTenant,
} from '@/services/tenant.service';
import type {
  CreateTenantInput,
  ListTenantsQuery,
  UpdateTenantInput,
} from '@/validations/tenant.validation';
import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

export const createTenantHandler = async (
  req: Request<unknown, unknown, CreateTenantInput>,
  res: Response,
) => {
  const tenant = await createTenant(req.user!.id, req.user!.role, req.body);

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: SUCCESS_MESSAGE.CREATED,
    data: tenant,
  });
};

export const listTenantsHandler = async (req: Request, res: Response) => {
  const { page, limit, property, unit, search, status, sortBy, sortOrder } =
    req.validatedQuery as unknown as ListTenantsQuery;

  const result = await listTenants(
    req.user!.id,
    req.user!.role,
    page,
    limit,
    property,
    unit,
    search,
    status,
    sortBy,
    sortOrder,
  );

  res.status(StatusCodes.OK).json({ success: true, ...result });
};

export const getTenantByIdHandler = async (req: Request<{ id: string }>, res: Response) => {
  const tenant = await getTenantById(req.params.id, req.user!.id, req.user!.role);

  res.status(StatusCodes.OK).json({ success: true, data: tenant });
};

export const updateTenantHandler = async (
  req: Request<{ id: string }, unknown, UpdateTenantInput>,
  res: Response,
) => {
  const tenant = await updateTenant(req.params.id, req.user!.id, req.user!.role, req.body);

  res.status(StatusCodes.OK).json({
    success: true,
    message: SUCCESS_MESSAGE.UPDATED,
    data: tenant,
  });
};

export const deleteTenantHandler = async (req: Request<{ id: string }>, res: Response) => {
  await deleteTenant(req.params.id, req.user!.id, req.user!.role);

  res.status(StatusCodes.OK).json({
    success: true,
    message: SUCCESS_MESSAGE.DELETED,
  });
};
