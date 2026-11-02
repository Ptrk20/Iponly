import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  form: null as {
    reset: () => void;
    elements: { namedItem: (name: string) => HTMLInputElement | null };
  } | null,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useRef: (current: unknown) => ({ current: current === null ? mocks.form : current }),
  useActionState: (action: (previous: unknown, data: FormData) => Promise<unknown>, initial: unknown) =>
    [initial, (data: FormData) => action(initial, data)],
}));

import { resetMutationForm, useMutationForm } from "@/hooks/use-mutation-form";

describe("mutation form completion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.form = null;
    vi.stubGlobal("HTMLInputElement", class { value = ""; });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("refreshes and releases the submission lock after every successful save", async () => {
    const result = { ok: true, message: "Saved." };
    const action = vi.fn(async () => result);
    const form = useMutationForm(action, { ok: false, message: "" });
    for (let index = 0; index < 2; index += 1) {
      form.submittedRef.current = true;
      await form.formAction(new FormData());
      expect(form.submittedRef.current).toBe(false);
    }
    expect(action).toHaveBeenCalledTimes(2);
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it("allows another attempt after a validation failure without refreshing", async () => {
    const action = vi.fn(async () => ({ ok: false, message: "Check amount." }));
    const form = useMutationForm(action, { ok: false, message: "" });
    form.submittedRef.current = true;
    await form.formAction(new FormData());
    expect(form.submittedRef.current).toBe(false);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("releases the lock and propagates unexpected errors without claiming success", async () => {
    const action = vi.fn(async () => { throw new Error("Request interrupted"); });
    const form = useMutationForm(action, { ok: false, message: "" });
    form.submittedRef.current = true;
    await expect(form.formAction(new FormData())).rejects.toThrow("Request interrupted");
    expect(form.submittedRef.current).toBe(false);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("explicitly clears hidden idempotency keys that survive a native form reset", () => {
    class Input { value = "previous-submission"; }
    vi.stubGlobal("HTMLInputElement", Input);
    try {
      const key = new Input();
      const reset = vi.fn();
      resetMutationForm({
        reset,
        elements: { namedItem: () => key as HTMLInputElement },
      });
      expect(reset).toHaveBeenCalledOnce();
      expect(key.value).toBe("");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses a fresh key for a new save but retains the key when retrying a failed save", async () => {
    class Input { value = ""; }
    vi.stubGlobal("HTMLInputElement", Input);
    try {
      const key = new Input();
      const reset = vi.fn();
      mocks.form = {
        reset,
        elements: { namedItem: () => key as HTMLInputElement },
      };
      const receivedKeys: (FormDataEntryValue | null)[] = [];
      let succeeds = true;
      const action = vi.fn(async (_previous: { ok: boolean }, data: FormData) => {
        receivedKeys.push(data.get("idempotencyKey"));
        return { ok: succeeds };
      });
      const form = useMutationForm(action, { ok: false });
      async function submit() {
        if (!key.value) key.value = crypto.randomUUID();
        const data = new FormData();
        data.set("idempotencyKey", key.value);
        await form.formAction(data);
      }

      await submit();
      expect(key.value).toBe("");
      await submit();
      expect(receivedKeys[1]).not.toBe(receivedKeys[0]);
      succeeds = false;
      await submit();
      expect(key.value).toBe(receivedKeys[2]);
      await submit();
      expect(receivedKeys[3]).toBe(receivedKeys[2]);
      expect(reset).toHaveBeenCalledTimes(2);
      expect(mocks.refresh).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("refreshes automatic toggles without resetting their values", async () => {
    const reset = vi.fn();
    mocks.form = { reset, elements: { namedItem: () => null } };
    const form = useMutationForm<{ ok: boolean }>(async () => ({ ok: true }), { ok: false }, false);
    await form.formAction(new FormData());
    expect(reset).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
