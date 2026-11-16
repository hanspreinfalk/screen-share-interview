import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared chrome for sign in and sign up.
 *
 * Both pages were near-identical copies, which is how the two drifted apart.
 * One layout keeps the entry point to the product consistent.
 */
export function AuthShell({
  heading,
  subheading,
  altHref,
  altLabel,
  children,
}: {
  heading: string;
  subheading: string;
  altHref: string;
  altLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="pacific-surface flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-6 md:px-12">
        <Link
          href="/"
          className="pr-label !text-[11px] !tracking-[0.18em] text-[var(--pr-ink)]"
        >
          Pacific
        </Link>
        <Link
          href={altHref}
          className="text-[12.5px] text-[var(--pr-muted)] transition-colors hover:text-[var(--pr-ink)]"
        >
          {altLabel}
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-20">
        <div className="mb-8 space-y-2 text-center">
          <h1 className="pr-display text-[2rem] leading-tight text-[var(--pr-ink)] md:text-[2.4rem]">
            {heading}
          </h1>
          <p className="text-[14px] text-[var(--pr-muted)]">{subheading}</p>
        </div>
        {children}
      </main>
    </div>
  );
}
