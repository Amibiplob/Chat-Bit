"use client";

import Link from "next/link";
import { Check, Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { useActionState, useState } from "react";
import { registerAction, type AuthState } from "@/app/actions/auth";

export function SignupForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(registerAction, {});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <form action={action} className="space-y-5" aria-busy={pending}>
      {state.error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{state.error}</p>}
      {/* Name */}
      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium">
          Full name
        </label>

        <div className="relative">
          <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

          <input
            id="name"
            name="name"
            type="text"
            placeholder="Md Biplob Hosain"
            maxLength={80}
            autoComplete="name"
            required
            className="h-11 w-full rounded-lg border bg-background pl-10 pr-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </div>
      </div>

      {/* Email */}
      <div className="space-y-2">
        <label htmlFor="signup-email" className="text-sm font-medium">
          Email address
        </label>

        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

          <input
            id="signup-email"
            name="email"
            type="email"
            placeholder="you@example.com"
            maxLength={254}
            autoComplete="email"
            required
            className="h-11 w-full rounded-lg border bg-background pl-10 pr-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </div>
      </div>

      {/* Password */}
      <div className="space-y-2">
        <label htmlFor="signup-password" className="text-sm font-medium">
          Password
        </label>

        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

          <input
            id="signup-password"
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder="Create a password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            required
            className="h-11 w-full rounded-lg border bg-background pl-10 pr-11 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
          />

          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {showPassword ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">Use 12–128 characters. Longer passphrases work well.</p>

      {/* Confirm password */}
      <div className="space-y-2">
        <label htmlFor="confirm-password" className="text-sm font-medium">
          Confirm password
        </label>

        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

          <input
            id="confirm-password"
            name="confirmPassword"
            type={showConfirmPassword ? "text" : "password"}
            placeholder="Confirm your password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            required
            className="h-11 w-full rounded-lg border bg-background pl-10 pr-11 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
          />

          <button
            type="button"
            aria-label={showConfirmPassword ? "Hide password" : "Show password"}
            onClick={() => setShowConfirmPassword((value) => !value)}
            className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {showConfirmPassword ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>
      </div>

      {/* Terms */}
      <div className="flex items-start gap-2">
        <input
          id="terms"
          name="terms"
          type="checkbox"
          required
          className="mt-0.5 size-4 rounded border accent-blue-500"
        />

        <label
          htmlFor="terms"
          className="text-xs leading-5 text-muted-foreground"
        >
          I agree to the{" "}
          <Link
            href="#"
            className="font-medium text-foreground hover:underline"
          >
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link
            href="#"
            className="font-medium text-foreground hover:underline"
          >
            Privacy Policy
          </Link>
          .
        </label>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={pending}
        className="h-11 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {pending ? "Creating account…" : "Create account"}
      </button>

      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Check className="size-3.5 text-blue-500" />
        Free to get started
      </div>
    </form>
  );
}
