import { OccupancyStatus } from '@/constants/occupancy-status';
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
    // Kept in sync by tenant.service: points at the unit's current non-inactive
    // tenant (active or pending), or null if none. Rent lives on Tenant, not here —
    // a unit has no rent of its own once a tenant's actual agreed rent is what matters.
    tenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
    },
  },
  { timestamps: true },
);

// A unit name only needs to be unique within its own property, not globally —
// two different properties can each have a "Block A".
unitSchema.index({ property: 1, name: 1 }, { unique: true });

export type Unit = InferSchemaType<typeof unitSchema>;

export default model('Unit', unitSchema);
