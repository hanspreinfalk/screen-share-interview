import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignUpPage() {
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
          href="/sign-in"
          className="pr-body text-[12.5px] text-[var(--pr-muted)] transition-colors hover:text-[var(--pr-ink)]"
        >
          Sign in
        </a>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
        <div className="mb-8 space-y-2 text-center">
          <h1 className="pr-display text-3xl text-[var(--pr-ink)] md:text-4xl">
            Create your account
          </h1>
          <p className="pr-body text-[14px] text-[var(--pr-muted)]">
            Sign up to start working with Pacific.
          </p>
        </div>
        <Suspense>
          <SignUp
            forceRedirectUrl="/"
            signInUrl="/sign-in"
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
