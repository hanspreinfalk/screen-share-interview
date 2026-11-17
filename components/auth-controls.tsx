"use client";

import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

export function AuthControls() {
  return (
    <div className="flex items-center gap-3">
      <Show when="signed-out">
        <SignInButton mode="redirect" forceRedirectUrl="/">
          <button
            type="button"
            className="text-[13px] text-[var(--friend-muted,var(--pr-muted))] transition-colors hover:text-[var(--friend-ink,var(--pr-ink))]"
          >
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="redirect" forceRedirectUrl="/">
          <button
            type="button"
            className="rounded-full bg-[var(--friend-ink,var(--pr-dark))] px-4 py-2 text-[12.5px] text-[var(--friend-cream,var(--pr-cream))] transition hover:opacity-90"
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
