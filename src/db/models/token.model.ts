import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * The kinds of short-lived, single-use tokens we persist. One model backs both
 * so the issue → store-hash → verify → consume flow is identical for each.
 */
export enum TokenType {
  EMAIL_VERIFICATION = 'email-verification',
  PASSWORD_RESET = 'password-reset',
}

const tokenSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Only the HMAC of the token is stored — a DB leak can't be turned back into
    // a usable link without the signing secret (mirrors refresh-token handling).
    tokenHash: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(TokenType),
      required: true,
    },
    // Checked explicitly in code; the TTL index below is only a background sweep.
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

// Fast lookup on verify: find the record for a presented token of a given kind.
tokenSchema.index({ tokenHash: 1, type: 1 });

// Let MongoDB reap expired tokens on its own so the collection can't grow
// unbounded from links that were issued but never used.
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type Token = InferSchemaType<typeof tokenSchema>;

export default model('Token', tokenSchema);
