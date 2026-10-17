"use client";

import { Check, Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { useState } from "react";
import { registerAction } from "@/app/actions/auth";
import { useAuthForm } from "./use-auth-form";
import { FieldError } from "@/components/ui/field-error";
import { PASSWORD_MIN, PASSWORD_MAX } from "@/lib/form-validation.mjs";

export function SignupForm() {
  const { state, action, pending, errors, onSubmit, field } = useAuthForm(registerAction, true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <form action={action} onSubmit={onSubmit} noValidate className="space-y-5" aria-busy={pending}>
      {Object.keys(errors).length > 0 && <p role="alert" className="text-sm text-destructive">Please correct the highlighted fields.</p>}
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
            defaultValue={state.values?.name}
            {...field("name")}
            type="text"
            placeholder="Md Biplob Hosain"
            maxLength={80}
            autoComplete="name"
            required
            className="h-11 w-full rounded-lg border bg-background pl-10 pr-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </div>
        <FieldError id="name" error={errors.name} />
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
            defaultValue={state.values?.email}
            {...field("email", "signup-email")}
            type="email"
            placeholder="you@example.com"
            maxLength={254}
            autoComplete="email"
            required
            className="h-11 w-full rounded-lg border bg-background pl-10 pr-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </div>
        <FieldError id="signup-email" error={errors.email} />
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
            {...field("password", "signup-password")}
            aria-describedby={errors.password ? "signup-password-error password-requirements" : "password-requirements"}
            type={showPassword ? "text" : "password"}
            placeholder="Create a password"
            minLength={PASSWORD_MIN}
            maxLength={PASSWORD_MAX}
            autoComplete="new-password"
            required
            className="h-11 w-full rounded-lg border bg-background pl-10 pr-11 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
          />

          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            aria-controls="signup-password"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {showPassword ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>
        <FieldError id="signup-password" error={errors.password} />
      </div>

      <p id="password-requirements" className="text-xs text-muted-foreground">Use {PASSWORD_MIN}–{PASSWORD_MAX} characters. Longer passphrases work well.</p>

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
            {...field("confirmPassword", "confirm-password")}
            type={showConfirmPassword ? "text" : "password"}
            placeholder="Confirm your password"
            minLength={PASSWORD_MIN}
            maxLength={PASSWORD_MAX}
            autoComplete="new-password"
            required
            className="h-11 w-full rounded-lg border bg-background pl-10 pr-11 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
          />

          <button
            type="button"
            aria-label={showConfirmPassword ? "Hide password" : "Show password"}
            aria-pressed={showConfirmPassword}
            aria-controls="confirm-password"
            onClick={() => setShowConfirmPassword((value) => !value)}
            className="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {showConfirmPassword ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>
        <FieldError id="confirm-password" error={errors.confirmPassword} />
      </div>

      {/* Terms */}
      <div className="flex items-start gap-2">
        <input
          id="terms"
          name="terms"
          {...field("terms")}
          type="checkbox"
          required
          className="mt-0.5 size-4 rounded border accent-teal-600"
        />

        <label
          htmlFor="terms"
          className="text-xs leading-5 text-muted-foreground"
        >
          I understand this is a portfolio demo with no published Terms of Service or Privacy Policy. Do not share sensitive information.
        </label>
      </div>
      <FieldError id="terms" error={errors.terms} />

      {/* Submit */}
      <button
        type="submit"
        disabled={pending}
        className="h-11 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {pending ? "Creating account…" : "Create account"}
      </button>

      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Check className="size-3.5 text-teal-600" />
        Free to get started
      </div>
    </form>
  );
}
