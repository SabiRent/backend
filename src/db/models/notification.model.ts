import { NotificationCategory } from '@/constants/notification-category';
import { Schema, model, type InferSchemaType } from 'mongoose';

const notificationSchema = new Schema(
  {
    // Who the notification belongs to. Every query is scoped to the logged-in
    // user by this field, so it's indexed.
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // What the notification is about — drives the category tabs/filter in the UI.
    // No default: whichever feature raises the notification always knows its
    // category, so we require it to be set explicitly rather than guess.
    category: {
      type: String,
      enum: Object.values(NotificationCategory),
      required: true,
    },
    // The bold headline of the row, e.g. "Rent Payment Received".
    title: {
      type: String,
      required: true,
      trim: true,
    },
    // The context line under the title, e.g. "Flat 3B - Sunshine Apartments".
    // Denormalized on purpose: a notification is a point-in-time record, so it
    // keeps the label it had when raised even if the unit is later renamed or
    // deleted. Optional — a notification not tied to a specific unit omits it.
    subtitle: {
      type: String,
      trim: true,
    },
    // The body line, e.g. "Chinedu Okafor has paid N850,000 for the Annual rent."
    message: {
      type: String,
      required: true,
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    // Stamped the moment the notification is marked read; stays null while unread.
    // Kept alongside isRead so the UI can show "read 2h ago" without a separate call.
    readAt: {
      type: Date,
      default: null,
    },
    // Optional free-form payload for the feature that raised the notification —
    // e.g. { paymentId, unitId } so the frontend can deep-link to the resource.
    // Not every notification has one, so it stays unset by default.
    meta: {
      type: Schema.Types.Mixed,
    },
  },
  { timestamps: true },
);

// The list view is always "this user's notifications, newest first", often
// narrowed to unread only — this compound index serves both shapes and the
// unread-count query without a collection scan.
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

export type Notification = InferSchemaType<typeof notificationSchema>;

export default model('Notification', notificationSchema);
