"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export function LogoutButton({ compact = false, iconOnly = false }: { compact?: boolean; iconOnly?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function signOut() {
    setError("");
    startTransition(async () => {
      try {
        const result = await authClient.signOut();
        if (result.error) {
          setError("Could not log out. Please try again.");
          return;
        }
        router.replace("/login");
        router.refresh();
      } catch {
        setError("Could not log out. Please try again.");
      }
    });
  }

  return (
    <div className={`logout-control${compact ? " logout-compact" : ""}`}>
      <button
        aria-label={iconOnly ? "Log out" : undefined}
        className={iconOnly ? "logout-button logout-icon-button" : "logout-button"}
        disabled={pending}
        onClick={signOut}
        type="button"
      >
        <LogOut aria-hidden="true" size={16} />
        {!iconOnly ? pending ? "Logging out" : "Log out" : null}
      </button>
      {error ? <span aria-live="polite" className="logout-error" role="status">{error}</span> : null}
    </div>
  );
}