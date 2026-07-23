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
    // Public URL of the user's profile image (empty until they upload one).
    avatarUrl: {
      type: String,
    },
    // The File record behind avatarUrl, kept so we can delete the old image
    // from storage when the user uploads a new one.
    avatarFileId: {
      type: Schema.Types.ObjectId,
      ref: 'File',
    },
  },
  { timestamps: true },
);

export type User = InferSchemaType<typeof userSchema>;

export default model('User', userSchema);
