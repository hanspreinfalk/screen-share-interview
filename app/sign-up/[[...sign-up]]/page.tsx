import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";

import { AuthShell } from "@/components/auth-shell";

export default function SignUpPage() {
  return (
    <AuthShell
      heading="Create your account"
      subheading="Five minutes on a call, one working automation."
      altHref="/sign-in"
      altLabel="Sign in"
    >
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
    </AuthShell>
  );
}
