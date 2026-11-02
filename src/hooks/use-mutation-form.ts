"use client";

import { useActionState, useRef } from "react";
import { useRouter } from "next/navigation";

export function resetMutationForm(form: Pick<HTMLFormElement, "reset"> & {
  elements: Pick<HTMLFormControlsCollection, "namedItem">;
}) {
  form.reset();
  const key = form.elements.namedItem("idempotencyKey");
  if (key instanceof HTMLInputElement) key.value = "";
}

export function useMutationForm<State extends { ok: boolean }>(
  action: (previous: State, formData: FormData) => Promise<State>,
  initialState: Awaited<State>,
  resetOnSuccess = true,
) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const submittedRef = useRef(false);
  const [state, formAction, pending] = useActionState<State, FormData>(async (previous, formData) => {
    try {
      const result = await action(previous, formData);
      if (result.ok) {
        if (formRef.current) {
          if (resetOnSuccess) resetMutationForm(formRef.current);
          else {
            const key = formRef.current.elements.namedItem("idempotencyKey");
            if (key instanceof HTMLInputElement) key.value = "";
          }
        }
        router.refresh();
      }
      return result;
    } finally {
      submittedRef.current = false;
    }
  }, initialState);

  return { state, formAction, formRef, submittedRef, pending };
}
