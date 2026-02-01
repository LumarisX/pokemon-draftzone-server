import { RouteOld } from ".";
import webPush from "web-push";
import {
  PushSubscriptionModel,
  IPushSubscriptionDoc,
} from "../models/push-subscription.model";
import { jwtCheck } from "../middleware/jwtcheck";
export const PushSubscriptionRoutes: RouteOld = {
  middleware: [jwtCheck],
  subpaths: {
    "/subscribe": {
      post: async (req, res) => {
        try {
          // Token is valid, user is authenticated. Get user ID (sub) and subscription.
          const userId = req.auth?.payload?.sub; // Safely access sub claim
          const subscription = req.body as webPush.PushSubscription; // The subscription from the frontend

          if (!userId) {
            console.error("Auth payload missing sub claim after validation.");
            return res
              .status(401)
              .json({ error: "Unauthorized: Missing user identifier." });
          }

          if (
            !subscription ||
            !subscription.endpoint ||
            !subscription.keys?.p256dh ||
            !subscription.keys?.auth
          ) {
            console.error(
              "Received invalid subscription object:",
              subscription,
            );
            return res
              .status(400)
              .json({ error: "Invalid subscription object received." });
          }

          console.log(
            `Received subscription for user: ${userId}, endpoint: ${subscription.endpoint.substring(
              0,
              30,
            )}...`,
          );

          // Use findOneAndUpdate with upsert based on the unique endpoint
          // This handles new subscriptions and updates existing ones (e.g., if re-subscribing)
          const filter = { endpoint: subscription.endpoint };
          const update: Partial<IPushSubscriptionDoc> = {
            userId: userId,
            subscription: {
              // Ensure the full object is stored correctly
              endpoint: subscription.endpoint,
              expirationTime: subscription.expirationTime,
              keys: subscription.keys,
            },
          };
          const options = {
            upsert: true, // Create if doesn't exist
            new: true, // Return the updated document
            setDefaultsOnInsert: true, // Apply default values (like createdAt) on insert
          };

          const savedSubscription =
            await PushSubscriptionModel.findOneAndUpdate(
              filter,
              update,
              options,
            );

          console.log(
            `Subscription saved/updated for user ${userId}, endpoint: ${savedSubscription!.endpoint.substring(
              0,
              30,
            )}...`,
          );
          res
            .status(201)
            .json({ message: "Subscription added/updated successfully." });
        } catch (error: any) {
          console.error("Error saving subscription:", error);
          // Handle potential duplicate key errors if unique index is violated (though upsert should prevent most)
          if (error.code === 11000) {
            return res
              .status(409)
              .json({ error: "Subscription endpoint already exists." });
          }
          // Handle JWT validation errors passed from middleware
          if (error.name === "UnauthorizedError" || error.status === 401) {
            return res
              .status(401)
              .json({ error: `Unauthorized: ${error.message}` });
          }
          res.status(500).json({ error: "Failed to save subscription." });
        }
      },
    },
    "/send-user-notification": {
      post: async (req, res) => {
        // Protect sending endpoint too? Or handle internally.
        try {
          // In a real app, you'd get targetUserId from your business logic
          const targetUserId = req.body.userId; // User's Auth0 'sub' id
          const payload = JSON.stringify({
            notification: {
              title: req.body.title || "Hello User!",
              body: req.body.body || `This notification is just for you!`,
              icon: "assets/icons/icon-192x192.png",
              data: { url: req.body.url || "/" },
            },
          });

          if (!targetUserId) {
            return res
              .status(400)
              .json({ error: "Missing target userId in request body." });
          }

          console.log(
            `Attempting to send notification to user: ${targetUserId}`,
          );

          // Find all subscriptions for the target user
          const userSubscriptions = await PushSubscriptionModel.find({
            userId: targetUserId,
          });

          if (userSubscriptions.length === 0) {
            console.log(`No subscriptions found for user ${targetUserId}`);
            return res.status(404).json({
              message: "No subscriptions found for the specified user.",
            });
          }

          let successCount = 0;
          let failureCount = 0;
          let expiredSubsEndpoints: string[] = [];

          // Send notification to each subscription
          const sendPromises = userSubscriptions.map((subDoc) => {
            console.log(
              `Sending to endpoint: ${subDoc.endpoint.substring(0, 30)}...`,
            );
            // Use the nested 'subscription' object which has the correct structure
            return webPush
              .sendNotification(subDoc.subscription, payload)
              .then(() => {
                successCount++;
                console.log(
                  `Successfully sent to ${subDoc.endpoint.substring(0, 30)}...`,
                );
              })
              .catch((err) => {
                failureCount++;
                console.error(
                  `Error sending to ${subDoc.endpoint.substring(0, 30)}...:`,
                  err.statusCode,
                  err.body,
                );
                if (err.statusCode === 404 || err.statusCode === 410) {
                  // Subscription is invalid or expired
                  console.log(
                    `Subscription ${subDoc.endpoint.substring(
                      0,
                      30,
                    )}... expired/invalid. Marking for removal.`,
                  );
                  expiredSubsEndpoints.push(subDoc.endpoint);
                }
              });
          });

          await Promise.all(sendPromises);

          // Remove expired subscriptions from DB *after* attempting all sends
          if (expiredSubsEndpoints.length > 0) {
            console.log(
              `Removing ${expiredSubsEndpoints.length} expired subscriptions...`,
            );
            await PushSubscriptionModel.deleteMany({
              endpoint: { $in: expiredSubsEndpoints },
            });
          }

          console.log(
            `Notification sending complete for user ${targetUserId}. Success: ${successCount}, Failed: ${failureCount}, Removed: ${expiredSubsEndpoints.length}`,
          );
          res.status(200).json({
            message: `Notifications sent. Success: ${successCount}, Failed: ${failureCount}, Removed: ${expiredSubsEndpoints.length}`,
          });
        } catch (error) {
          console.error("Error sending user notification:", error);
          res.status(500).json({ error: "Failed to send notification." });
        }
      },
    },
  },
  params: {},
};
