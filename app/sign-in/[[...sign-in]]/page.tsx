import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";

import { AuthShell } from "@/components/auth-shell";

export default function SignInPage() {
  return (
    <AuthShell
      heading="Welcome back"
      subheading="Sign in to continue with Pacific."
      altHref="/sign-up"
      altLabel="Create account"
    >
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
    </AuthShell>
  );
}
