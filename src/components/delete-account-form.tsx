"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function DeleteAccountForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (confirmation !== "DELETE") {
      setError("Type DELETE exactly to confirm account removal.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await authClient.deleteUser({ password });
        if (result.error) {
          setError(
            result.error.status === 401 || result.error.status === 400
              ? "Account deletion could not be verified. Check your password and try again."
              : "We couldn’t delete your account. Please try again.",
          );
          return;
        }

        router.replace("/login?account-deleted=1");
        router.refresh();
      } catch {
        setError("We couldn’t delete your account. Please try again.");
      }
    });
  }

  return (
    <form className="delete-account-form" onSubmit={submit}>
      <label className="form-field">
        <span>Current password</span>
        <input
          autoComplete="current-password"
          disabled={pending}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>
      <label className="form-field">
        <span>Type DELETE to confirm</span>
        <input
          autoComplete="off"
          disabled={pending}
          onChange={(event) => setConfirmation(event.target.value)}
          required
          value={confirmation}
        />
      </label>
      {error ? <p aria-live="assertive" className="form-error" role="alert">{error}</p> : null}
      <button className="button delete-account-button" disabled={pending} type="submit">
        {pending ? "Deleting account…" : "Permanently delete my account"}
      </button>
    </form>
  );
}
