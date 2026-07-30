import { PaymentFrequency } from '@/constants/payment-frequency';
import { TenantStatus } from '@/constants/tenant-status';
import { Schema, model, type InferSchemaType } from 'mongoose';

const tenantSchema = new Schema(
  {
    unit: {
      type: Schema.Types.ObjectId,
      ref: 'Unit',
      required: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    rentAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentFrequency: {
      type: String,
      enum: Object.values(PaymentFrequency),
      required: true,
    },
    lastPaymentDate: {
      type: Date,
      required: true,
    },
    nextDueDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(TenantStatus),
      default: TenantStatus.ACTIVE,
    },
  },
  { timestamps: true },
);

// Only one *active* tenant per unit at a time — past (inactive) and upcoming
// (pending) tenant records for the same unit are still allowed to coexist.
// Named explicitly so it can never collide with the default `unit_1` name Mongoose
// would otherwise generate for a plain (non-partial) index on the same key.
tenantSchema.index(
  { unit: 1 },
  {
    unique: true,
    partialFilterExpression: { status: TenantStatus.ACTIVE },
    name: 'unique_active_tenant_per_unit',
  },
);

export type Tenant = InferSchemaType<typeof tenantSchema>;

export default model('Tenant', tenantSchema);
