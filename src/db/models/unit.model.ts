import { OccupancyStatus } from '@/constants/occupancy-status';
import { RentInterval } from '@/constants/rent-interval';
import { Schema, model, type InferSchemaType } from 'mongoose';

const unitSchema = new Schema(
  {
    property: {
      type: Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    occupancyStatus: {
      type: String,
      enum: Object.values(OccupancyStatus),
      default: OccupancyStatus.VACANT,
    },
    rentAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    rentInterval: {
      type: String,
      enum: Object.values(RentInterval),
      default: RentInterval.YEARLY,
    },
  },
  { timestamps: true },
);

// A unit name only needs to be unique within its own property, not globally —
// two different properties can each have a "Block A".
unitSchema.index({ property: 1, name: 1 }, { unique: true });

export type Unit = InferSchemaType<typeof unitSchema>;

export default model('Unit', unitSchema);
