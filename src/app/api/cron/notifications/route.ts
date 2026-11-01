import { timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/lib/server-env";
import { dispatchScheduledNotifications } from "@/services/notification-service";

export async function GET(request: Request) {
  let cronSecret: string | undefined;
  try {
    cronSecret = getServerEnv().NOTIFICATION_CRON_SECRET;
  } catch {
    console.error("Iponly notification scheduler configuration is invalid.");
    return Response.json({ error: "Notification scheduler is not configured." }, { status: 503 });
  }

  if (!cronSecret) return Response.json({ error: "Notification scheduler is not configured." }, { status: 503 });

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expectedBuffer = Buffer.from(cronSecret);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await dispatchScheduledNotifications();
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Iponly scheduled notification dispatch failed.");
    return Response.json({ error: "Notification dispatch failed." }, { status: 500 });
  }
}
