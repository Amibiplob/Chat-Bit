"use client";

import Link from "next/link";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useState } from "react";
import { loginAction } from "@/app/actions/auth";
import { useAuthForm } from "./use-auth-form";
import { FieldError } from "@/components/ui/field-error";

export function LoginForm() {
  const { state, action, pending, errors, onSubmit, field } = useAuthForm(loginAction);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} onSubmit={onSubmit} noValidate className="space-y-5" aria-busy={pending}>
      {Object.keys(errors).length > 0 && <p role="alert" className="text-sm text-destructive">Please correct the highlighted fields.</p>}
      {state.error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{state.error}</p>}
      {/* Email */}
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">
          Email address
        </label>

        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

          <input
            id="email"
            name="email"
            defaultValue={state.values?.email}
            {...field("email")}
            type="email"
            placeholder="you@example.com"
            maxLength={254}
            autoComplete="email"
            required
            className="h-12 w-full rounded-xl border bg-background pl-10 pr-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </div>
        <FieldError id="email" error={errors.email} />
      </div>

      {/* Password */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>

          <Link
            href="/forgot-password"
            className="text-xs font-medium text-teal-600 hover:text-teal-700 hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

          <input
            id="password"
            name="password"
            {...field("password")}
            type={showPassword ? "text" : "password"}
            placeholder="Enter your password"
            maxLength={128}
            autoComplete="current-password"
            required
            className="h-12 w-full rounded-xl border bg-background pl-10 pr-11 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
          />

          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            aria-controls="password"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {showPassword ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>
        <FieldError id="password" error={errors.password} />
      </div>

      <p className="text-xs text-muted-foreground">Your session lasts 7 days. Sign out on shared devices.</p>

      {/* Submit */}
      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>

    </form>
  );
}
