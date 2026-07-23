import { ErrorCode } from '@/constants/error-code';
import { ERROR_MESSAGE } from '@/constants/message';
import { UserRole } from '@/constants/user-role';
import Property, { type Property as PropertyDoc } from '@/db/models/property.model';
import AppError from '@/errors/AppError';
import { deleteImage, uploadImageBuffer } from '@/utils/cloudinary.util';
import type { CreatePropertyInput, UpdatePropertyInput } from '@/validations/property.validation';
import { StatusCodes } from 'http-status-codes';
import { isValidObjectId, type HydratedDocument } from 'mongoose';

const sanitizeProperty = (property: HydratedDocument<PropertyDoc>) => ({
  id: property._id.toString(),
  owner: property.owner.toString(),
  name: property.name,
  address: property.address,
  type: property.type,
  unitCount: property.unitCount,
  description: property.description,
  image: property.image,
  createdAt: property.createdAt,
  updatedAt: property.updatedAt,
});

const isPrivilegedRole = (role: UserRole) =>
  role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;

const findPropertyOrThrow = async (propertyId: string) => {
  if (!isValidObjectId(propertyId)) {
    throw AppError(ERROR_MESSAGE.INVALID_ID, StatusCodes.BAD_REQUEST, ErrorCode.INVALID_ID);
  }

  const property = await Property.findById(propertyId).select('+imagePublicId');

  if (!property) {
    throw AppError(
      ERROR_MESSAGE.PROPERTY_NOT_FOUND,
      StatusCodes.NOT_FOUND,
      ErrorCode.RESOURCE_NOT_FOUND,
    );
  }

  return property;
};

// Ownership rule: a landlord may only touch their own properties; admins/super-admins may touch any.
const assertOwnership = (
  property: HydratedDocument<PropertyDoc>,
  userId: string,
  role: UserRole,
) => {
  if (isPrivilegedRole(role)) return;

  if (property.owner.toString() !== userId) {
    throw AppError(
      ERROR_MESSAGE.NOT_PROPERTY_OWNER,
      StatusCodes.FORBIDDEN,
      ErrorCode.NOT_PROPERTY_OWNER,
    );
  }
};

export const createProperty = async (
  ownerId: string,
  input: CreatePropertyInput,
  imageFile?: Express.Multer.File,
) => {
  let image: string | undefined;
  let imagePublicId: string | undefined;

  if (imageFile) {
    const uploaded = await uploadImageBuffer(imageFile.buffer, 'properties');
    image = uploaded.secureUrl;
    imagePublicId = uploaded.publicId;
  }

  const property = await Property.create({ ...input, owner: ownerId, image, imagePublicId });

  return sanitizeProperty(property);
};

export const listProperties = async (
  userId: string,
  role: UserRole,
  page: number,
  limit: number,
) => {
  const skip = (page - 1) * limit;
  // Landlords only ever see their own properties; admins/super-admins see everything.
  const filter = isPrivilegedRole(role) ? {} : { owner: userId };

  const [properties, total] = await Promise.all([
    Property.find(filter).skip(skip).limit(limit),
    Property.countDocuments(filter),
  ]);

  return {
    properties: properties.map(sanitizeProperty),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const getPropertyById = async (propertyId: string, userId: string, role: UserRole) => {
  const property = await findPropertyOrThrow(propertyId);
  assertOwnership(property, userId, role);

  return sanitizeProperty(property);
};

export const updateProperty = async (
  propertyId: string,
  userId: string,
  role: UserRole,
  input: UpdatePropertyInput,
  imageFile?: Express.Multer.File,
) => {
  const property = await findPropertyOrThrow(propertyId);
  assertOwnership(property, userId, role);

  Object.assign(property, input);

  if (imageFile) {
    const previousImagePublicId = property.imagePublicId;
    const uploaded = await uploadImageBuffer(imageFile.buffer, 'properties');

    property.image = uploaded.secureUrl;
    property.imagePublicId = uploaded.publicId;

    // Only drop the old asset once the new one is safely uploaded, so a failed
    // upload never leaves the property pointing at an image that no longer exists.
    if (previousImagePublicId) {
      await deleteImage(previousImagePublicId);
    }
  }

  await property.save();

  return sanitizeProperty(property);
};

export const deleteProperty = async (propertyId: string, userId: string, role: UserRole) => {
  const property = await findPropertyOrThrow(propertyId);
  assertOwnership(property, userId, role);

  await property.deleteOne();

  if (property.imagePublicId) {
    await deleteImage(property.imagePublicId);
  }
};
