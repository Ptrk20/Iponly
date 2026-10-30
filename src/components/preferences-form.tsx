"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { completeOnboardingAction, savePreferencesAction } from "@/actions/preferences";
import type { UserPreferences } from "@/types/preferences";

type PreferenceValues = Pick<
  UserPreferences,
  "defaultCurrencyCode" | "locale" | "timezone" | "theme" | "firstDayOfWeek"
>;

export function PreferencesForm({
  initialValues,
  displayName,
  onboarding = false,
}: {
  initialValues: PreferenceValues;
  displayName: string;
  onboarding?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [name, setName] = useState(displayName);
  const [values, setValues] = useState(initialValues);

  function update<K extends keyof PreferenceValues>(key: K, value: PreferenceValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    startTransition(async () => {
      try {
        const action = onboarding ? completeOnboardingAction : savePreferencesAction;
        const result = await action({ displayName: name, ...values });
        if (!result.ok) {
          setError(result.message);
          return;
        }

        if (onboarding) {
          router.replace("/");
        } else {
          setMessage("Your preferences are saved.");
        }
        router.refresh();
      } catch {
        setError("We couldn’t save your preferences. Please try again.");
      }
    });
  }

  return (
    <form className="preferences-form" onSubmit={submit}>
      <label className="form-field"><span>Display name</span><input autoComplete="name" maxLength={80} onChange={(event) => setName(event.target.value)} required value={name} /></label>
      <label className="form-field"><span>Default currency</span><select onChange={(event) => update("defaultCurrencyCode", event.target.value as PreferenceValues["defaultCurrencyCode"])} value={values.defaultCurrencyCode}><option value="PHP">PHP · Philippine peso</option><option value="USD">USD · US dollar</option><option value="EUR">EUR · Euro</option><option value="JPY">JPY · Japanese yen</option></select></label>
      <label className="form-field"><span>Language and locale</span><select onChange={(event) => update("locale", event.target.value as PreferenceValues["locale"])} value={values.locale}><option value="en-PH">English · Philippines</option><option value="fil-PH">Filipino · Philippines</option></select></label>
      <label className="form-field"><span>Timezone</span><input autoComplete="off" onChange={(event) => update("timezone", event.target.value)} placeholder="Asia/Manila" required value={values.timezone} /></label>
      <label className="form-field"><span>Theme</span><select onChange={(event) => update("theme", event.target.value as PreferenceValues["theme"])} value={values.theme}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <label className="form-field"><span>First day of week</span><select onChange={(event) => update("firstDayOfWeek", event.target.value as PreferenceValues["firstDayOfWeek"])} value={values.firstDayOfWeek}><option value="monday">Monday</option><option value="sunday">Sunday</option></select></label>
      {error ? <p aria-live="assertive" className="form-error" role="alert">{error}</p> : null}
      {message ? <p aria-live="polite" className="form-success" role="status"><Check aria-hidden="true" size={15} />{message}</p> : null}
      <button className="button button-primary" disabled={pending} type="submit">{pending ? "Saving…" : onboarding ? "Finish setup" : "Save preferences"}</button>
    </form>
  );
}