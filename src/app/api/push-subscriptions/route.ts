import { getCurrentUser } from "@/lib/auth-session";
import { getServerEnv } from "@/lib/server-env";
import { pushSubscriptionSchema } from "@/lib/validations/notifications";
import {
  deleteAllPushSubscriptions,
  deletePushSubscription,
  savePushSubscription,
} from "@/repositories/notification-repository";

export async function POST(request: Request) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    console.error("Iponly could not resolve the session for push subscription setup.");
    return Response.json({ error: "Your session could not be verified." }, { status: 500 });
  }
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  let env;
  try {
    env = getServerEnv();
  } catch {
    console.error("Iponly push subscription configuration is invalid.");
    return Response.json({ error: "Push notifications are not configured on this server." }, { status: 503 });
  }
  if (!hasTrustedOrigin(request, env.BETTER_AUTH_URL, env.NEXT_PUBLIC_APP_URL)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid subscription data." }, { status: 400 });
  }
  const parsed = pushSubscriptionSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid subscription data." }, { status: 400 });

  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    return Response.json({ error: "Push notifications are not configured on this server." }, { status: 503 });
  }

  try {
    await savePushSubscription(user.id, {
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Push endpoint is already registered to another account.") {
      return Response.json({ error: "This device subscription is already connected to another account." }, { status: 409 });
    }
    console.error("Iponly could not save a push subscription.");
    return Response.json({ error: "We couldn’t enable notifications. Please try again." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    console.error("Iponly could not resolve the session for push subscription removal.");
    return Response.json({ error: "Your session could not be verified." }, { status: 500 });
  }
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  let env;
  try {
    env = getServerEnv();
  } catch {
    console.error("Iponly push subscription configuration is invalid.");
    return Response.json({ error: "Push notifications are not configured on this server." }, { status: 503 });
  }
  if (!hasTrustedOrigin(request, env.BETTER_AUTH_URL, env.NEXT_PUBLIC_APP_URL)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid subscription data." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid subscription data." }, { status: 400 });
  }
  const parsedEndpoint = "endpoint" in body
    ? pushSubscriptionSchema.shape.endpoint.safeParse(body.endpoint)
    : null;
  const removeAll = "all" in body && body.all === true;
  if (!removeAll && !parsedEndpoint?.success) {
    return Response.json({ error: "Invalid subscription data." }, { status: 400 });
  }

  try {
    if (removeAll) await deleteAllPushSubscriptions(user.id);
    else if (parsedEndpoint?.success) await deletePushSubscription(user.id, parsedEndpoint.data);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Iponly could not remove a push subscription.");
    return Response.json({ error: "We couldn’t turn off notifications. Please try again." }, { status: 500 });
  }
}

function hasTrustedOrigin(request: Request, ...trustedUrls: string[]) {
  const requestOrigin = request.headers.get("origin");
  if (!requestOrigin) return false;
  return trustedUrls.some((url) => new URL(url).origin === requestOrigin);
}
