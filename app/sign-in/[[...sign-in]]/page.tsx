import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignInPage() {
  return (
    <div className="pacific-surface flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-8 py-6 md:px-12">
        <a
          href="/"
          className="pr-label !text-[11px] !tracking-[0.18em] text-[var(--pr-ink)]"
        >
          Pacific
        </a>
        <a
          href="/sign-up"
          className="pr-body text-[12.5px] text-[var(--pr-muted)] transition-colors hover:text-[var(--pr-ink)]"
        >
          Create account
        </a>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
        <div className="mb-8 space-y-2 text-center">
          <h1 className="pr-display text-3xl text-[var(--pr-ink)] md:text-4xl">
            Welcome back
          </h1>
          <p className="pr-body text-[14px] text-[var(--pr-muted)]">
            Sign in to continue with Pacific.
          </p>
        </div>
        <Suspense>
          <SignIn
            forceRedirectUrl="/"
            signUpUrl="/sign-up"
            appearance={{
              elements: {
                rootBox: "mx-auto",
                card: "shadow-none border border-[var(--pr-line)]",
              },
            }}
          />
        </Suspense>
      </main>
    </div>
  );
}
