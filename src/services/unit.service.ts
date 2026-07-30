import { ErrorCode } from '@/constants/error-code';
import { ERROR_MESSAGE } from '@/constants/message';
import type { OccupancyStatus } from '@/constants/occupancy-status';
import type { UserRole } from '@/constants/user-role';
import Property from '@/db/models/property.model';
import Unit, { type Unit as UnitDoc } from '@/db/models/unit.model';
import AppError from '@/errors/AppError';
import { getPropertyById, isPrivilegedRole } from '@/services/property.service';
import { escapeRegExp } from '@/utils/helper.util';
import type { CreateUnitInput, UpdateUnitInput } from '@/validations/unit.validation';
import { StatusCodes } from 'http-status-codes';
import { isValidObjectId, type HydratedDocument, type QueryFilter } from 'mongoose';

// `property` is typed as an ObjectId by the schema, but once a document has gone
// through `.populate('property')` it holds the full Property document at runtime —
// this bridges that gap at the one place callers need the real object.
interface PopulatedUnitProperty {
  _id: { toString(): string };
  name: string;
  owner: { toString(): string };
}

const asPopulatedProperty = (property: UnitDoc['property']): PopulatedUnitProperty =>
  property as unknown as PopulatedUnitProperty;

const sanitizeUnit = (unit: HydratedDocument<UnitDoc>) => {
  const property = asPopulatedProperty(unit.property);

  return {
    id: unit._id.toString(),
    property: { id: property._id.toString(), name: property.name },
    name: unit.name,
    occupancyStatus: unit.occupancyStatus,
    // Always null until Tenant management exists — no assignment endpoint
    // sets this yet, so there's nothing to populate.
    tenant: unit.tenant ? unit.tenant.toString() : null,
    rentAmount: unit.rentAmount,
    rentInterval: unit.rentInterval,
    createdAt: unit.createdAt,
    updatedAt: unit.updatedAt,
  };
};

const findUnitOrThrow = async (unitId: string) => {
  if (!isValidObjectId(unitId)) {
    throw AppError(ERROR_MESSAGE.INVALID_ID, StatusCodes.BAD_REQUEST, ErrorCode.INVALID_ID);
  }

  const unit = await Unit.findById(unitId).populate('property');

  if (!unit) {
    throw AppError(
      ERROR_MESSAGE.UNIT_NOT_FOUND,
      StatusCodes.NOT_FOUND,
      ErrorCode.RESOURCE_NOT_FOUND,
    );
  }

  return unit;
};

// A unit's ownership is entirely inherited from its property, so the same masking
// rule applies: a non-owner gets the identical 404 a nonexistent unit would return.
const assertUnitOwnership = (unit: HydratedDocument<UnitDoc>, userId: string, role: UserRole) => {
  if (isPrivilegedRole(role)) return;

  const property = asPopulatedProperty(unit.property);

  if (property.owner.toString() !== userId) {
    throw AppError(
      ERROR_MESSAGE.UNIT_NOT_FOUND,
      StatusCodes.NOT_FOUND,
      ErrorCode.RESOURCE_NOT_FOUND,
    );
  }
};

const isDuplicateKeyError = (error: unknown): boolean =>
  Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);

export const createUnit = async (ownerId: string, role: UserRole, input: CreateUnitInput) => {
  // Confirms the property exists and belongs to this landlord (or the caller is an
  // admin) before a unit can be attached to it — same 404 masking as elsewhere.
  await getPropertyById(input.property, ownerId, role);

  try {
    const unit = await Unit.create(input);
    await unit.populate('property');

    return sanitizeUnit(unit);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw AppError(
        ERROR_MESSAGE.UNIT_NAME_ALREADY_EXISTS,
        StatusCodes.CONFLICT,
        ErrorCode.DUPLICATE_ENTRY,
      );
    }

    throw error;
  }
};

export const listUnits = async (
  userId: string,
  role: UserRole,
  page: number,
  limit: number,
  propertyId?: string,
  search?: string,
  occupancyStatus?: OccupancyStatus,
  sortBy: 'name' | 'createdAt' | 'rentAmount' = 'createdAt',
  sortOrder: 'asc' | 'desc' = 'desc',
) => {
  const skip = (page - 1) * limit;
  const filter: QueryFilter<UnitDoc> = {};

  if (propertyId) {
    // Validates the property is accessible to this caller before scoping the list
    // to it — reuses the same existence/ownership check as fetching it directly.
    await getPropertyById(propertyId, userId, role);
    filter.property = propertyId;
  } else if (!isPrivilegedRole(role)) {
    // Landlords with no propertyId filter see units across all of their own
    // properties — units carry no owner of their own, so this resolves it via a join.
    const ownedPropertyIds = await Property.find({ owner: userId }).distinct('_id');
    filter.property = { $in: ownedPropertyIds };
  }

  if (search) {
    filter.name = new RegExp(escapeRegExp(search), 'i');
  }

  if (occupancyStatus) {
    filter.occupancyStatus = occupancyStatus;
  }

  const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 } as const;

  const [units, total] = await Promise.all([
    Unit.find(filter).sort(sort).skip(skip).limit(limit).populate('property'),
    Unit.countDocuments(filter),
  ]);

  return {
    units: units.map(sanitizeUnit),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const getUnitById = async (unitId: string, userId: string, role: UserRole) => {
  const unit = await findUnitOrThrow(unitId);
  assertUnitOwnership(unit, userId, role);

  return sanitizeUnit(unit);
};

export const updateUnit = async (
  unitId: string,
  userId: string,
  role: UserRole,
  input: UpdateUnitInput,
) => {
  const unit = await findUnitOrThrow(unitId);
  assertUnitOwnership(unit, userId, role);

  Object.assign(unit, input);

  try {
    await unit.save();
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw AppError(
        ERROR_MESSAGE.UNIT_NAME_ALREADY_EXISTS,
        StatusCodes.CONFLICT,
        ErrorCode.DUPLICATE_ENTRY,
      );
    }

    throw error;
  }

  return sanitizeUnit(unit);
};

export const deleteUnit = async (unitId: string, userId: string, role: UserRole) => {
  const unit = await findUnitOrThrow(unitId);
  assertUnitOwnership(unit, userId, role);

  await unit.deleteOne();
};
