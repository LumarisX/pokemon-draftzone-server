import { model, Schema } from "mongoose";

interface IPushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

interface IBrowserPushSubscription {
  endpoint: string;
  expirationTime?: number | null;
  keys: IPushSubscriptionKeys;
}

export interface IPushSubscriptionDoc extends Document {
  userId: string;
  endpoint: string;
  subscription: IBrowserPushSubscription;
  createdAt: Date;
}

const PushSubscriptionSchema: Schema = new Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  endpoint: {
    type: String,
    required: true,
    index: true,
    unique: true,
  },
  subscription: {
    endpoint: {
      type: String,
      required: true,
    },
    expirationTime: {
      type: Number,
      required: true,
    },
    keys: {
      p256dh: {
        type: String,
        required: true,
      },
      auth: {
        type: String,
        required: true,
      },
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
});

PushSubscriptionSchema.index({ userId: 1, endpoint: 1 }, { unique: true });

export const PushSubscriptionModel = model<IPushSubscriptionDoc>(
  "PushSubscription",
  PushSubscriptionSchema
);
