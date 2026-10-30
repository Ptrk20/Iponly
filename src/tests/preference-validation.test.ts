import { describe, expect, it } from "vitest";
import { registrationInputSchema } from "@/lib/validations/auth";
import { preferencesInputSchema } from "@/lib/validations/preferences";

describe("Phase 2 input validation", () => {
  it("rejects malformed registration and mismatched passwords", () => {
    expect(registrationInputSchema.safeParse({ name: "Alex", email: "not-an-email", password: "long-enough-password", confirmPassword: "long-enough-password" }).success).toBe(false);
    expect(registrationInputSchema.safeParse({ name: "Alex", email: "alex@example.test", password: "long-enough-password", confirmPassword: "different-password" }).success).toBe(false);
  });

  it("rejects unsupported preference values and ignores forged ownership fields", () => {
    const result = preferencesInputSchema.safeParse({
      userId: "user-b",
      displayName: "Alex",
      defaultCurrencyCode: "CAD",
      locale: "en-PH",
      timezone: "Mars/Olympus",
      theme: "neon",
      firstDayOfWeek: "monday",
    });
    expect(result.success).toBe(false);

    const valid = preferencesInputSchema.parse({
      userId: "user-b",
      displayName: "Alex",
      defaultCurrencyCode: "PHP",
      locale: "en-PH",
      timezone: "Asia/Manila",
      theme: "system",
      firstDayOfWeek: "monday",
    });
    expect(valid).not.toHaveProperty("userId");
  });
});