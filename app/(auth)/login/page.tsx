
import { LoginForm } from "@/components/auth/login-form";
import Link from "next/link";

export default function LoginPage() {
  return (
    <>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>

        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to your ChatBit account and continue your conversations.
        </p>
      </div>

      <LoginForm />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?
        <Link
          href="/signup"
          className="font-semibold text-blue-500 hover:text-blue-600 hover:underline"
        >
          Create one
        </Link>
      </p>
    </>
  );
}
