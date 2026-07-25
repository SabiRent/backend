import { UserRole } from '@/constants/user-role';
import { Schema, model, type InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.USER,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    // The user's profile image lives in the files collection. We store only the
    // reference here and resolve the actual URL from it on read, so the files
    // collection stays the single source of truth.
    avatarFileId: {
      type: Schema.Types.ObjectId,
      ref: 'File',
    },
  },
  { timestamps: true },
);

export type User = InferSchemaType<typeof userSchema>;

export default model('User', userSchema);
