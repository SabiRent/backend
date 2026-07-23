import { PropertyType } from '@/constants/property-type';
import { Schema, model, type InferSchemaType } from 'mongoose';

const addressSchema = new Schema(
  {
    street: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
      default: 'Nigeria',
    },
  },
  { _id: false },
);

const propertySchema = new Schema(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: addressSchema,
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(PropertyType),
      default: PropertyType.RESIDENTIAL,
    },
    unitCount: {
      type: Number,
      required: true,
      min: 1,
    },
    description: {
      type: String,
      trim: true,
    },
    image: {
      type: String,
      trim: true,
    },
    imagePublicId: {
      type: String,
      trim: true,
      select: false,
    },
  },
  { timestamps: true },
);

export type Property = InferSchemaType<typeof propertySchema>;

export default model('Property', propertySchema);
