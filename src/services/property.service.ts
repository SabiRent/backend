import { ErrorCode } from '@/constants/error-code';
import { ERROR_MESSAGE } from '@/constants/message';
import { UserRole } from '@/constants/user-role';
import type { FileDocument } from '@/db/models/file.model';
import Property, { type Property as PropertyDoc } from '@/db/models/property.model';
import AppError from '@/errors/AppError';
import { deleteFile, uploadFile } from '@/services/file.service';
import { escapeRegExp } from '@/utils/helper.util';
import type { CreatePropertyInput, UpdatePropertyInput } from '@/validations/property.validation';
import { StatusCodes } from 'http-status-codes';
import { isValidObjectId, type HydratedDocument, type QueryFilter } from 'mongoose';

const PROPERTY_IMAGE_FOLDER = 'property-photos';

// `image` is typed as an ObjectId by the schema, but once a document has gone
// through `.populate('image')` it holds the full File document at runtime —
// this cast bridges that gap at the one place callers need the real object.
const asPopulatedFile = (image: PropertyDoc['image']): FileDocument | undefined =>
  image ? (image as unknown as FileDocument) : undefined;

const uploadPropertyImageFile = async (file: Express.Multer.File): Promise<string> => {
  const { file: fileDoc } = await uploadFile({ file, folder: PROPERTY_IMAGE_FOLDER });

  return fileDoc._id.toString();
};

const sanitizeProperty = (property: HydratedDocument<PropertyDoc>) => ({
  id: property._id.toString(),
  owner: property.owner.toString(),
  name: property.name,
  address: property.address,
  unitCount: property.unitCount,
  description: property.description,
  image: asPopulatedFile(property.image)?.url,
  createdAt: property.createdAt,
  updatedAt: property.updatedAt,
});

export const isPrivilegedRole = (role: UserRole) =>
  role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;

const findPropertyOrThrow = async (propertyId: string) => {
  if (!isValidObjectId(propertyId)) {
    throw AppError(ERROR_MESSAGE.INVALID_ID, StatusCodes.BAD_REQUEST, ErrorCode.INVALID_ID);
  }

  const property = await Property.findById(propertyId).populate('image');

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
// A non-owner gets the exact same 404 as a truly nonexistent property (not a 403) — otherwise
// the status code alone would leak whether a given property ID exists to someone who can't access it.
const assertOwnership = (
  property: HydratedDocument<PropertyDoc>,
  userId: string,
  role: UserRole,
) => {
  if (isPrivilegedRole(role)) return;

  if (property.owner.toString() !== userId) {
    throw AppError(
      ERROR_MESSAGE.PROPERTY_NOT_FOUND,
      StatusCodes.NOT_FOUND,
      ErrorCode.RESOURCE_NOT_FOUND,
    );
  }
};

export const createProperty = async (
  ownerId: string,
  input: CreatePropertyInput,
  imageFile?: Express.Multer.File,
) => {
  const image = imageFile ? await uploadPropertyImageFile(imageFile) : undefined;

  const property = await Property.create({ ...input, owner: ownerId, image });

  if (image) {
    await property.populate('image');
  }

  return sanitizeProperty(property);
};

export const listProperties = async (
  userId: string,
  role: UserRole,
  page: number,
  limit: number,
  search?: string,
  sortBy: 'name' | 'createdAt' | 'unitCount' = 'createdAt',
  sortOrder: 'asc' | 'desc' = 'desc',
) => {
  const skip = (page - 1) * limit;
  // Landlords only ever see their own properties; admins/super-admins see everything.
  const filter: QueryFilter<PropertyDoc> = isPrivilegedRole(role) ? {} : { owner: userId };

  if (search) {
    const pattern = new RegExp(escapeRegExp(search), 'i');
    filter.$or = [{ name: pattern }, { 'address.street': pattern }, { 'address.city': pattern }];
  }

  const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 } as const;

  const [properties, total] = await Promise.all([
    Property.find(filter).sort(sort).skip(skip).limit(limit).populate('image'),
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

  const previousImage = asPopulatedFile(property.image);

  Object.assign(property, input);

  if (imageFile) {
    const imageId = await uploadPropertyImageFile(imageFile);
    property.set('image', imageId);
  }

  await property.save();

  // Only drop the old asset once the new one is safely saved, so a failed
  // upload/save never leaves the property pointing at a file that no longer exists.
  if (imageFile && previousImage) {
    await deleteFile(previousImage._id.toString());
  }

  if (imageFile) {
    await property.populate('image');
  }

  return sanitizeProperty(property);
};

export const deleteProperty = async (propertyId: string, userId: string, role: UserRole) => {
  const property = await findPropertyOrThrow(propertyId);
  assertOwnership(property, userId, role);

  const image = asPopulatedFile(property.image);

  await property.deleteOne();

  if (image) {
    await deleteFile(image._id.toString());
  }
};
