import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDatabase, type IponlyDatabase } from "@/db";
import { notificationDeliveries, pushSubscriptions, userPreferences } from "@/db/schema";

export async function getPushSubscriptionCount(userId: string, database: IponlyDatabase = getDatabase()) {
  const [result] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  return result?.count ?? 0;
}

export async function savePushSubscription(
  userId: string,
  subscription: { endpoint: string; p256dh: string; auth: string },
  database: IponlyDatabase = getDatabase(),
) {
  return database.transaction(async (transaction) => {
    await transaction
      .insert(pushSubscriptions)
      .values({ userId, ...subscription })
      .onConflictDoNothing({ target: pushSubscriptions.endpoint });

    const [existing] = await transaction
      .select({ id: pushSubscriptions.id, userId: pushSubscriptions.userId })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, subscription.endpoint))
      .limit(1);

    if (!existing || existing.userId !== userId) {
      throw new Error("Push endpoint is already registered to another account.");
    }

    const [saved] = await transaction
      .update(pushSubscriptions)
      .set({ p256dh: subscription.p256dh, auth: subscription.auth, updatedAt: new Date() })
      .where(and(eq(pushSubscriptions.id, existing.id), eq(pushSubscriptions.userId, userId)))
      .returning({ id: pushSubscriptions.id });
    if (!saved) throw new Error("Push subscription could not be saved.");
    return saved;
  });
}

export async function deletePushSubscription(
  userId: string,
  endpoint: string,
  database: IponlyDatabase = getDatabase(),
) {
  await database
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

export async function deleteAllPushSubscriptions(userId: string, database: IponlyDatabase = getDatabase()) {
  await database.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
}

export async function updateNotificationPreferences(
  userId: string,
  preferences: {
    debtRemindersEnabled?: boolean;
    tripRemindersEnabled?: boolean;
    todoRemindersEnabled?: boolean;
    monthlyAnalyticsEnabled?: boolean;
  },
  database: IponlyDatabase = getDatabase(),
) {
  const [updated] = await database
    .update(userPreferences)
    .set({ ...preferences, updatedAt: new Date() })
    .where(eq(userPreferences.userId, userId))
    .returning({ userId: userPreferences.userId });

  if (!updated) throw new Error("Notification preferences were not found.");
}

export async function claimNotificationDelivery(
  subscriptionId: string,
  notificationKey: string,
  database: IponlyDatabase = getDatabase(),
) {
  const [claim] = await database
    .insert(notificationDeliveries)
    .values({ subscriptionId, notificationKey })
    .onConflictDoNothing({
      target: [notificationDeliveries.subscriptionId, notificationDeliveries.notificationKey],
    })
    .returning({ id: notificationDeliveries.id });
  return claim?.id;
}

export async function markNotificationDelivered(
  deliveryId: string,
  database: IponlyDatabase = getDatabase(),
) {
  await database
    .update(notificationDeliveries)
    .set({ status: "sent", sentAt: new Date() })
    .where(eq(notificationDeliveries.id, deliveryId));
}

export async function releaseNotificationClaim(
  deliveryId: string,
  database: IponlyDatabase = getDatabase(),
) {
  await database
    .delete(notificationDeliveries)
    .where(and(eq(notificationDeliveries.id, deliveryId), eq(notificationDeliveries.status, "pending")));
}

export async function clearStaleNotificationClaims(
  olderThan: Date,
  database: IponlyDatabase = getDatabase(),
) {
  await database
    .delete(notificationDeliveries)
    .where(and(eq(notificationDeliveries.status, "pending"), sql`${notificationDeliveries.createdAt} < ${olderThan}`));
}

export async function removePushSubscriptionById(
  subscriptionId: string,
  database: IponlyDatabase = getDatabase(),
) {
  await database.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscriptionId));
}
