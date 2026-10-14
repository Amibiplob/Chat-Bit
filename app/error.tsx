"use client";

export default function ApplicationError({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">ChatBit is temporarily unavailable</h1>
      <p className="text-sm text-muted-foreground">Please try again in a moment.</p>
      <button onClick={reset} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">Try again</button>
    </main>
  );
}
