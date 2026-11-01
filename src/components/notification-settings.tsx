"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { saveNotificationPreferencesAction } from "@/actions/notifications";

type ReminderPreferences = {
  debtRemindersEnabled: boolean;
  tripRemindersEnabled: boolean;
  todoRemindersEnabled: boolean;
  monthlyAnalyticsEnabled: boolean;
};

const reminderOptions: Array<{ key: keyof ReminderPreferences; label: string; detail: string }> = [
  { key: "debtRemindersEnabled", label: "Debt due dates", detail: "3 days before an upcoming installment" },
  { key: "tripRemindersEnabled", label: "Upcoming trips", detail: "7 days before a trip starts" },
  { key: "todoRemindersEnabled", label: "Trip to-dos", detail: "3 days before a to-do is due" },
  { key: "monthlyAnalyticsEnabled", label: "Monthly analytics", detail: "On the 1st of each month" },
];

export function NotificationSettings({
  initialPreferences,
  vapidPublicKey,
  hasPushSubscription,
}: {
  initialPreferences: ReminderPreferences;
  vapidPublicKey: string | null;
  hasPushSubscription: boolean;
}) {
  const router = useRouter();
  const [preferences, setPreferences] = useState(initialPreferences);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const pushSupported = useSyncExternalStore(subscribeToPushSupport, getPushSupport, () => false);
  const permission = useSyncExternalStore(subscribeToPermission, getPermission, () => "unsupported");
  const [subscribedHere, setSubscribedHere] = useState(false);
  const [pushPending, setPushPending] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!pushSupported) return;
    void navigator.serviceWorker.getRegistration("/").then(async (registration) => {
      if (!registration) return;
      const subscription = await registration.pushManager.getSubscription();
      setSubscribedHere(Boolean(subscription));
    }).catch(() => {
      setError("Iponly couldn’t check this device’s notification status.");
    });
  }, [pushSupported]);

  function updatePreference(key: keyof ReminderPreferences, checked: boolean) {
    setPreferences((current) => ({ ...current, [key]: checked }));
    setMessage("");
  }

  function savePreferences(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    startTransition(async () => {
      const result = await saveNotificationPreferencesAction(preferences);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessage("Reminder preferences saved.");
    });
  }

  async function enablePush() {
    setError("");
    setMessage("");
    setPushPending(true);
    try {
      if (!pushSupported || !vapidPublicKey) {
        throw new Error("Push notifications are not available on this device or are not configured.");
      }

      const grantedPermission = await Notification.requestPermission();
      if (grantedPermission !== "granted") {
        throw new Error(grantedPermission === "denied"
          ? "Notifications are blocked. Allow them in your browser or phone settings, then try again."
          : "Allow notifications to receive reminders.");
      }

      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription = existingSubscription ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeApplicationServerKey(vapidPublicKey),
      });

      const response = await fetch("/api/push-subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      await assertSuccessfulResponse(response);
      setSubscribedHere(true);
      setMessage("Push reminders are enabled on this device.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn’t enable notifications. Please try again.");
    } finally {
      setPushPending(false);
    }
  }

  async function disablePush(removeAllDevices: boolean) {
    setError("");
    setMessage("");
    setPushPending(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (!removeAllDevices && !subscription) {
        throw new Error("This device does not have an active push subscription.");
      }

      const response = await fetch("/api/push-subscriptions", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(removeAllDevices ? { all: true } : { endpoint: subscription?.endpoint }),
      });
      await assertSuccessfulResponse(response);
      if (subscription) await subscription.unsubscribe();
      setSubscribedHere(false);
      setMessage(removeAllDevices
        ? "Push reminders have been turned off on all devices."
        : "Push reminders have been turned off on this device.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn’t turn off notifications. Please try again.");
    } finally {
      setPushPending(false);
    }
  }

  return (
    <div className="notification-settings">
      <form onSubmit={savePreferences}>
        <fieldset className="notification-preference-list">
          <legend>Reminder types</legend>
          {reminderOptions.map(({ key, label, detail }) => (
            <label className="settings-row notification-preference" key={key}>
              <span className="settings-row-copy"><strong>{label}</strong><span>{detail}</span></span>
              <input
                checked={preferences[key]}
                onChange={(event) => updatePreference(key, event.target.checked)}
                type="checkbox"
              />
            </label>
          ))}
        </fieldset>
        <p className="settings-footnote">Reminders are sent at 9:00 AM in your profile timezone.</p>
        <button className="button button-secondary" disabled={pending} type="submit">
          {pending ? "Saving…" : "Save reminder preferences"}
        </button>
      </form>

      <div className="notification-push-controls">
        <div className="settings-row-copy">
          <strong>Phone and browser notifications</strong>
          <span>
            {hasPushSubscription
              ? "Push notifications are enabled for at least one of your devices."
              : "Enable push on this device to receive reminders when Iponly is not open."}
          </span>
        </div>
        {!vapidPublicKey ? (
          <p className="form-hint">Push delivery is not configured on this server yet.</p>
        ) : !pushSupported ? (
          <p className="form-hint">This browser does not support web push notifications.</p>
        ) : subscribedHere ? (
          <button className="button button-secondary" disabled={pushPending} onClick={() => void disablePush(false)} type="button">
            {pushPending ? "Updating…" : "Turn off on this device"}
          </button>
        ) : (
          <button className="button button-primary" disabled={pushPending} onClick={() => void enablePush()} type="button">
            {pushPending ? "Enabling…" : "Enable push on this device"}
          </button>
        )}
        {hasPushSubscription && !subscribedHere ? (
          <button className="text-link notification-remove-all" disabled={pushPending} onClick={() => void disablePush(true)} type="button">
            Turn off push on all devices
          </button>
        ) : null}
        <p className="settings-footnote">
          On iPhone or iPad, add Iponly to your Home Screen, open the installed app, and enable notifications here. Your device must also allow notifications for Iponly.
        </p>
      </div>

      {error ? <p aria-live="assertive" className="form-error" role="alert">{error}</p> : null}
      {message ? <p aria-live="polite" className="form-success" role="status"><Check aria-hidden="true" size={15} />{message}</p> : null}
      {pushSupported && permission === "denied" ? (
        <p className="form-hint">Notifications are blocked by your browser or operating system. Change permission in device settings to enable push.</p>
      ) : null}
    </div>
  );
}

function subscribeToPushSupport(callback: () => void) {
  window.addEventListener("focus", callback);
  return () => window.removeEventListener("focus", callback);
}

function getPushSupport() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function subscribeToPermission(callback: () => void) {
  window.addEventListener("focus", callback);
  return () => window.removeEventListener("focus", callback);
}

function getPermission(): NotificationPermission | "unsupported" {
  return "Notification" in window ? Notification.permission : "unsupported";
}

function decodeApplicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function assertSuccessfulResponse(response: Response) {
  if (response.ok) return;
  let message = "We couldn’t update push notifications. Please try again.";
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
      message = body.error;
    }
  } catch {
    throw new Error(message);
  }
  throw new Error(message);
}
