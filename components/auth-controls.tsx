"use client";

import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

export function AuthControls() {
  return (
    <div className="flex items-center gap-3">
      <Show when="signed-out">
        <SignInButton mode="redirect" forceRedirectUrl="/interview">
          <button
            type="button"
            className="pr-body cursor-pointer text-[12.5px] text-[var(--pr-muted)] transition-colors hover:text-[var(--pr-ink)]"
          >
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="redirect" forceRedirectUrl="/interview">
          <button
            type="button"
            className="pr-pill cursor-pointer !bg-[var(--pr-dark)] !px-4 !py-2 !text-[12.5px] !text-[var(--pr-cream)] hover:!bg-[var(--pr-dark-hover)]"
          >
            Sign up
          </button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <UserButton
          appearance={{
            elements: {
              avatarBox: "h-8 w-8",
            },
          }}
        />
      </Show>
    </div>
  );
}
