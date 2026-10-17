"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { AuthState } from "@/app/actions/auth";
import { formErrors, loginSchema, registrationFormSchema } from "@/lib/form-validation.mjs";

export function useAuthForm(serverAction: (state: AuthState, data: FormData) => Promise<AuthState>, register = false) {
  const [state, action, pending] = useActionState<AuthState, FormData>(serverAction, {});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const busy = useRef(false);
  useEffect(() => { if (!pending) busy.current = false; }, [pending, state]);
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (busy.current || pending) { event.preventDefault(); return; }
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const next = formErrors(register ? registrationFormSchema : loginSchema, data);
    if (register && data.terms !== "on") next.terms = "Please acknowledge the portfolio demo notice.";
    setErrors(next);
    if (Object.keys(next).length) {
      event.preventDefault();
      // Follow the visible form order rather than the schema's property order.
      const first = Array.from(event.currentTarget.elements).find(
        element => element instanceof HTMLInputElement && next[element.name],
      );
      (first as HTMLElement | undefined)?.focus();
    } else busy.current = true;
  }
  function field(name: string, id = name) {
    return { "aria-invalid": Boolean(errors[name]), "aria-describedby": errors[name] ? `${id}-error` : undefined };
  }
  return { state, action, pending, errors, onSubmit, field };
}
