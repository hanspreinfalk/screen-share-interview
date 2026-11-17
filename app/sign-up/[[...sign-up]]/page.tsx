import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";

import { AuthShell } from "@/components/auth-shell";

export default function SignUpPage() {
  return (
    <AuthShell
      heading="Join Pacific"
      subheading="A friend to talk things through with."
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
              card: "shadow-none border border-black/8 bg-white/70",
            },
          }}
        />
      </Suspense>
    </AuthShell>
  );
}
