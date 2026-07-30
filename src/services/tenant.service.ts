import { ErrorCode } from '@/constants/error-code';
import { ERROR_MESSAGE } from '@/constants/message';
import { OccupancyStatus } from '@/constants/occupancy-status';
import { TenantStatus } from '@/constants/tenant-status';
import type { UserRole } from '@/constants/user-role';
import Property from '@/db/models/property.model';
import Tenant, { type Tenant as TenantDoc } from '@/db/models/tenant.model';
import Unit from '@/db/models/unit.model';
import AppError from '@/errors/AppError';
import { getPropertyById, isPrivilegedRole } from '@/services/property.service';
import { getUnitById, isDuplicateKeyError } from '@/services/unit.service';
import { calculateNextDueDate, escapeRegExp } from '@/utils/helper.util';
import type { CreateTenantInput, UpdateTenantInput } from '@/validations/tenant.validation';
import { StatusCodes } from 'http-status-codes';
import { isValidObjectId, type HydratedDocument, type QueryFilter } from 'mongoose';

// `unit` is typed as an ObjectId by the schema, but once a document has gone through
// `.populate({ path: 'unit', populate: { path: 'property' } })` it holds the full Unit
// document (itself with a populated `property`) at runtime.
interface PopulatedTenantUnit {
  _id: { toString(): string };
  name: string;
  property: { _id: { toString(): string }; name: string; owner: { toString(): string } };
}

const asPopulatedUnit = (unit: TenantDoc['unit']): PopulatedTenantUnit =>
  unit as unknown as PopulatedTenantUnit;

const sanitizeTenant = (tenant: HydratedDocument<TenantDoc>) => {
  const unit = asPopulatedUnit(tenant.unit);

  return {
    id: tenant._id.toString(),
    unit: {
      id: unit._id.toString(),
      name: unit.name,
      property: { id: unit.property._id.toString(), name: unit.property.name },
    },
    fullName: tenant.fullName,
    phone: tenant.phone,
    email: tenant.email,
    rentAmount: tenant.rentAmount,
    paymentFrequency: tenant.paymentFrequency,
    lastPaymentDate: tenant.lastPaymentDate,
    nextDueDate: tenant.nextDueDate,
    status: tenant.status,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
  };
};

const findTenantOrThrow = async (tenantId: string) => {
  if (!isValidObjectId(tenantId)) {
    throw AppError(ERROR_MESSAGE.INVALID_ID, StatusCodes.BAD_REQUEST, ErrorCode.INVALID_ID);
  }

  const tenant = await Tenant.findById(tenantId).populate({
    path: 'unit',
    populate: { path: 'property' },
  });

  if (!tenant) {
    throw AppError(
      ERROR_MESSAGE.TENANT_NOT_FOUND,
      StatusCodes.NOT_FOUND,
      ErrorCode.RESOURCE_NOT_FOUND,
    );
  }

  return tenant;
};

// A tenant's ownership is inherited from its unit, which in turn inherits from its
// property — same masking rule two hops deep: a non-owner gets an identical 404.
const assertTenantOwnership = (
  tenant: HydratedDocument<TenantDoc>,
  userId: string,
  role: UserRole,
) => {
  if (isPrivilegedRole(role)) return;

  const unit = asPopulatedUnit(tenant.unit);

  if (unit.property.owner.toString() !== userId) {
    throw AppError(
      ERROR_MESSAGE.TENANT_NOT_FOUND,
      StatusCodes.NOT_FOUND,
      ErrorCode.RESOURCE_NOT_FOUND,
    );
  }
};

// Keeps Unit in sync with its current tenant. Invariant: a unit's `tenant` field points
// at any non-inactive tenant (active or pending); `occupancyStatus` is "occupied" if and
// only if that tenant is specifically active. Passing `null` clears both (tenant deleted).
const syncUnitForTenant = async (
  unitId: string,
  tenant: { _id: { toString(): string }; status: TenantStatus } | null,
) => {
  const isAssigned = Boolean(tenant) && tenant?.status !== TenantStatus.INACTIVE;

  await Unit.findByIdAndUpdate(unitId, {
    tenant: isAssigned ? tenant?._id : null,
    occupancyStatus:
      tenant?.status === TenantStatus.ACTIVE ? OccupancyStatus.OCCUPIED : OccupancyStatus.VACANT,
  });
};

export const createTenant = async (ownerId: string, role: UserRole, input: CreateTenantInput) => {
  // Confirms the unit exists and belongs to this landlord (or the caller is an admin)
  // before a tenant can be attached to it — same 404 masking as elsewhere.
  await getUnitById(input.unit, ownerId, role);

  const nextDueDate = calculateNextDueDate(input.lastPaymentDate, input.paymentFrequency);

  let tenant: HydratedDocument<TenantDoc>;

  try {
    tenant = await Tenant.create({ ...input, nextDueDate });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw AppError(
        ERROR_MESSAGE.UNIT_ALREADY_HAS_ACTIVE_TENANT,
        StatusCodes.CONFLICT,
        ErrorCode.DUPLICATE_ENTRY,
      );
    }

    throw error;
  }

  await syncUnitForTenant(input.unit, tenant);
  await tenant.populate({ path: 'unit', populate: { path: 'property' } });

  return sanitizeTenant(tenant);
};

export const listTenants = async (
  userId: string,
  role: UserRole,
  page: number,
  limit: number,
  propertyId?: string,
  unitId?: string,
  search?: string,
  status?: TenantStatus,
  sortBy: 'fullName' | 'createdAt' | 'nextDueDate' | 'rentAmount' = 'createdAt',
  sortOrder: 'asc' | 'desc' = 'desc',
) => {
  const skip = (page - 1) * limit;
  const filter: QueryFilter<TenantDoc> = {};

  if (unitId) {
    // Validates the unit is accessible to this caller before scoping to it.
    await getUnitById(unitId, userId, role);
    filter.unit = unitId;
  } else if (propertyId) {
    await getPropertyById(propertyId, userId, role);
    const unitIds = await Unit.find({ property: propertyId }).distinct('_id');
    filter.unit = { $in: unitIds };
  } else if (!isPrivilegedRole(role)) {
    // No property/unit filter and not privileged — scope to every tenant across
    // every unit under every property this landlord owns (a two-hop join).
    const ownedPropertyIds = await Property.find({ owner: userId }).distinct('_id');
    const ownedUnitIds = await Unit.find({ property: { $in: ownedPropertyIds } }).distinct('_id');
    filter.unit = { $in: ownedUnitIds };
  }

  if (search) {
    filter.fullName = new RegExp(escapeRegExp(search), 'i');
  }

  if (status) {
    filter.status = status;
  }

  const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 } as const;

  const [tenants, total] = await Promise.all([
    Tenant.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate({ path: 'unit', populate: { path: 'property' } }),
    Tenant.countDocuments(filter),
  ]);

  return {
    tenants: tenants.map(sanitizeTenant),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const getTenantById = async (tenantId: string, userId: string, role: UserRole) => {
  const tenant = await findTenantOrThrow(tenantId);
  assertTenantOwnership(tenant, userId, role);

  return sanitizeTenant(tenant);
};

export const updateTenant = async (
  tenantId: string,
  userId: string,
  role: UserRole,
  input: UpdateTenantInput,
) => {
  const tenant = await findTenantOrThrow(tenantId);
  assertTenantOwnership(tenant, userId, role);

  const unitId = asPopulatedUnit(tenant.unit)._id.toString();
  const statusChanged = input.status !== undefined && input.status !== tenant.status;

  Object.assign(tenant, input);

  // Recompute nextDueDate whenever either of its inputs changes.
  if (input.lastPaymentDate !== undefined || input.paymentFrequency !== undefined) {
    tenant.nextDueDate = calculateNextDueDate(tenant.lastPaymentDate, tenant.paymentFrequency);
  }

  try {
    await tenant.save();
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw AppError(
        ERROR_MESSAGE.UNIT_ALREADY_HAS_ACTIVE_TENANT,
        StatusCodes.CONFLICT,
        ErrorCode.DUPLICATE_ENTRY,
      );
    }

    throw error;
  }

  if (statusChanged) {
    await syncUnitForTenant(unitId, tenant);
  }

  return sanitizeTenant(tenant);
};

export const deleteTenant = async (tenantId: string, userId: string, role: UserRole) => {
  const tenant = await findTenantOrThrow(tenantId);
  assertTenantOwnership(tenant, userId, role);

  const unitId = asPopulatedUnit(tenant.unit)._id.toString();

  await tenant.deleteOne();
  await syncUnitForTenant(unitId, null);
};
