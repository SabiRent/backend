import { ErrorCode } from '@/constants/error-code';
import { ERROR_MESSAGE } from '@/constants/message';
import { FileVisibility } from '@/constants/storage';
import { UserRole } from '@/constants/user-role';
import FileModel, { type FileDocument } from '@/db/models/file.model';
import Property, { type Property as PropertyDoc } from '@/db/models/property.model';
import AppError from '@/errors/AppError';
import { getStorageAdapter } from '@/services/storage';
import type { CreatePropertyInput, UpdatePropertyInput } from '@/validations/property.validation';
import { StatusCodes } from 'http-status-codes';
import { isValidObjectId, type HydratedDocument } from 'mongoose';

const PROPERTY_IMAGE_FOLDER = 'property-photos';

// `image` is typed as an ObjectId by the schema, but once a document has gone
// through `.populate('image')` it holds the full File document at runtime —
// this cast bridges that gap at the one place callers need the real object.
const asPopulatedFile = (image: PropertyDoc['image']): FileDocument | undefined =>
  image ? (image as unknown as FileDocument) : undefined;

const uploadPropertyImageFile = async (file: Express.Multer.File): Promise<string> => {
  const adapter = getStorageAdapter();

  const uploaded = await adapter.upload({
    buffer: file.buffer,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    folder: PROPERTY_IMAGE_FOLDER,
  });

  const fileDoc = await FileModel.create({
    provider: adapter.provider,
    providerFileId: uploaded.providerFileId,
    url: uploaded.url,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    visibility: FileVisibility.PUBLIC,
    folder: PROPERTY_IMAGE_FOLDER,
    metadata: uploaded.metadata,
  });

  return fileDoc._id.toString();
};

const deletePropertyImageFile = async (file: FileDocument) => {
  const adapter = getStorageAdapter(file.provider);
  const metadata = file.metadata as { resourceType?: string; deliveryType?: string } | undefined;

  await adapter.delete(file.providerFileId, {
    resourceType: metadata?.resourceType,
    deliveryType: metadata?.deliveryType,
  });

  await file.deleteOne();
};

const sanitizeProperty = (property: HydratedDocument<PropertyDoc>) => ({
  id: property._id.toString(),
  owner: property.owner.toString(),
  name: property.name,
  address: property.address,
  type: property.type,
  unitCount: property.unitCount,
  description: property.description,
  image: asPopulatedFile(property.image)?.url,
  createdAt: property.createdAt,
  updatedAt: property.updatedAt,
});

const isPrivilegedRole = (role: UserRole) =>
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
) => {
  const skip = (page - 1) * limit;
  // Landlords only ever see their own properties; admins/super-admins see everything.
  const filter = isPrivilegedRole(role) ? {} : { owner: userId };

  const [properties, total] = await Promise.all([
    Property.find(filter).skip(skip).limit(limit).populate('image'),
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
    await deletePropertyImageFile(previousImage);
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
    await deletePropertyImageFile(image);
  }
};
