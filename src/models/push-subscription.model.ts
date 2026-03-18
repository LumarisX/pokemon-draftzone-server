import { model, Schema } from "mongoose";

interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

interface BrowserPushSubscription {
  endpoint: string;
  expirationTime?: number | null;
  keys: PushSubscriptionKeys;
}

export type PushSubscriptionData = {
  userId: string;
  endpoint: string;
  subscription: BrowserPushSubscription;
};

const PushSubscriptionSchema: Schema<PushSubscriptionData> = new Schema({
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
      default: null,
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
  },
});

PushSubscriptionSchema.index({ userId: 1, endpoint: 1 }, { unique: true });

export const PushSubscriptionModel = model<PushSubscriptionData>(
  "PushSubscription",
  PushSubscriptionSchema,
);
