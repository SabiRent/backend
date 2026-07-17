import { Schema, model, type InferSchemaType } from 'mongoose';

const refreshTokenSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    tokenHash: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

export type RefreshToken = InferSchemaType<typeof refreshTokenSchema>;

export default model('RefreshToken', refreshTokenSchema);
