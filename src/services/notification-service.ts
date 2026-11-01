import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import { getDatabase, type IponlyDatabase } from "@/db";
import { debtInstallments, debts, pushSubscriptions, travelTodos, trips, userPreferences } from "@/db/schema";
import { dateKeyInTimezone } from "@/lib/analytics";
import { getServerEnv } from "@/lib/server-env";
import {
  claimNotificationDelivery,
  clearStaleNotificationClaims,
  markNotificationDelivered,
  releaseNotificationClaim,
  removePushSubscriptionById,
} from "@/repositories/notification-repository";

const DEBT_REMINDER_DAYS = 3;
const TRIP_REMINDER_DAYS = 7;
const TODO_REMINDER_DAYS = 3;
const NOTIFICATION_HOUR = 9;
const STALE_CLAIM_AGE_MS = 10 * 60 * 1000;

interface NotificationSubscription {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface NotificationCandidate {
  key: string;
  title: string;
  body: string;
  url: string;
  category: "debt" | "trip" | "todo" | "monthly";
}

interface PushSender {
  (subscription: NotificationSubscription, candidate: NotificationCandidate): Promise<void>;
}

function addCalendarDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getLocalTime(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  return { hour: part("hour"), minute: part("minute") };
}

async function findCandidates(
  userId: string,
  timezone: string,
  enabled: {
    debt: boolean;
    trip: boolean;
    todo: boolean;
    monthly: boolean;
  },
  now: Date,
  database: IponlyDatabase,
): Promise<NotificationCandidate[]> {
  const today = dateKeyInTimezone(now, timezone);
  const localTime = getLocalTime(now, timezone);
  if (localTime.hour < NOTIFICATION_HOUR) return [];

  const candidates: NotificationCandidate[] = [];
  const queries: Promise<void>[] = [];

  if (enabled.debt) {
    const dueDate = new Date(`${addCalendarDays(today, DEBT_REMINDER_DAYS)}T00:00:00.000Z`);
    queries.push((async () => {
      const [installment] = await database
        .select({ id: debtInstallments.id })
        .from(debtInstallments)
        .innerJoin(
          debts,
          and(eq(debtInstallments.debtId, debts.id), eq(debtInstallments.userId, debts.userId)),
        )
        .where(and(
          eq(debtInstallments.userId, userId),
          eq(debts.status, "active"),
          inArray(debtInstallments.status, ["scheduled", "partially_paid", "overdue"]),
          eq(debtInstallments.dueDate, dueDate),
        ))
        .limit(1);
      if (installment) {
        candidates.push({
          key: `debts:${today}`,
          title: "Upcoming debt due date",
          body: "You have an installment coming up. Open Iponly to review your debt schedule.",
          url: "/debt",
          category: "debt",
        });
      }
    })());
  }

  if (enabled.trip) {
    const startDate = addCalendarDays(today, TRIP_REMINDER_DAYS);
    queries.push((async () => {
      const [upcomingTrip] = await database
        .select({ id: trips.id })
        .from(trips)
        .where(and(
          eq(trips.userId, userId),
          inArray(trips.status, ["idea", "planning", "booked", "ongoing"]),
          eq(trips.startDate, startDate),
        ))
        .limit(1);
      if (upcomingTrip) {
        candidates.push({
          key: `trips:${today}`,
          title: "Upcoming trip",
          body: "Your trip is coming up. Open Iponly to review your travel plans.",
          url: "/travel",
          category: "trip",
        });
      }
    })());
  }

  if (enabled.todo) {
    const dueDate = addCalendarDays(today, TODO_REMINDER_DAYS);
    queries.push((async () => {
      const [todo] = await database
        .select({ id: travelTodos.id })
        .from(travelTodos)
        .innerJoin(
          trips,
          and(eq(travelTodos.tripId, trips.id), eq(travelTodos.userId, trips.userId)),
        )
        .where(and(
          eq(travelTodos.userId, userId),
          eq(travelTodos.status, "pending"),
          inArray(trips.status, ["idea", "planning", "booked", "ongoing"]),
          eq(travelTodos.dueDate, dueDate),
        ))
        .limit(1);
      if (todo) {
        candidates.push({
          key: `todos:${today}`,
          title: "Trip to-do coming up",
          body: "A trip to-do is coming up. Open Iponly to review your checklist.",
          url: "/travel",
          category: "todo",
        });
      }
    })());
  }

  if (enabled.monthly && new Date(`${today}T00:00:00.000Z`).getUTCDate() === 1) {
    const previousMonth = new Date(`${today}T00:00:00.000Z`);
    previousMonth.setUTCMonth(previousMonth.getUTCMonth() - 1);
    const monthKey = previousMonth.toISOString().slice(0, 7);
    candidates.push({
      key: `monthly-analytics:${monthKey}`,
      title: "Your monthly analytics are ready",
      body: "Take a look at last month’s financial summary in Iponly.",
      url: "/analytics?period=last-month",
      category: "monthly",
    });
  }

  await Promise.all(queries);
  return candidates;
}

async function sendWebPush(subscription: NotificationSubscription, candidate: NotificationCandidate) {
  const env = getServerEnv();
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    throw new Error("Web Push is not configured.");
  }

  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  await webpush.sendNotification(
    { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
    JSON.stringify({ title: candidate.title, body: candidate.body, url: candidate.url }),
    { TTL: 60 * 60 * 24 },
  );
}

export async function dispatchScheduledNotifications(options: {
  database?: IponlyDatabase;
  now?: Date;
  send?: PushSender;
} = {}) {
  const database = options.database ?? getDatabase();
  const now = options.now ?? new Date();
  const send = options.send ?? sendWebPush;
  await clearStaleNotificationClaims(new Date(now.getTime() - STALE_CLAIM_AGE_MS), database);

  const targets = await database
    .select({
      subscriptionId: pushSubscriptions.id,
      userId: pushSubscriptions.userId,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      timezone: userPreferences.timezone,
      debtRemindersEnabled: userPreferences.debtRemindersEnabled,
      tripRemindersEnabled: userPreferences.tripRemindersEnabled,
      todoRemindersEnabled: userPreferences.todoRemindersEnabled,
      monthlyAnalyticsEnabled: userPreferences.monthlyAnalyticsEnabled,
    })
    .from(pushSubscriptions)
    .innerJoin(userPreferences, eq(pushSubscriptions.userId, userPreferences.userId));

  const candidateCache = new Map<string, Promise<NotificationCandidate[]>>();
  let sent = 0;
  let failed = 0;
  let removed = 0;

  for (const target of targets) {
    let candidatesPromise = candidateCache.get(target.userId);
    if (!candidatesPromise) {
      candidatesPromise = findCandidates(target.userId, target.timezone, {
        debt: target.debtRemindersEnabled,
        trip: target.tripRemindersEnabled,
        todo: target.todoRemindersEnabled,
        monthly: target.monthlyAnalyticsEnabled,
      }, now, database);
      candidateCache.set(target.userId, candidatesPromise);
    }

    const subscription = {
      id: target.subscriptionId,
      userId: target.userId,
      endpoint: target.endpoint,
      p256dh: target.p256dh,
      auth: target.auth,
    };
    for (const candidate of await candidatesPromise) {
      const deliveryId = await claimNotificationDelivery(subscription.id, candidate.key, database);
      if (!deliveryId) continue;

      try {
        await send(subscription, candidate);
        await markNotificationDelivered(deliveryId, database);
        sent += 1;
      } catch (error) {
        failed += 1;
        const statusCode = isWebPushError(error) ? error.statusCode : undefined;
        if (statusCode === 404 || statusCode === 410) {
          await removePushSubscriptionById(subscription.id, database);
          removed += 1;
        } else {
          await releaseNotificationClaim(deliveryId, database);
        }
        console.error("Iponly push delivery failed.", { category: candidate.category, statusCode });
      }
    }
  }

  return { checked: targets.length, sent, failed, removed };
}

function isWebPushError(error: unknown): error is Error & { statusCode: number } {
  return error instanceof Error && "statusCode" in error && typeof error.statusCode === "number";
}
