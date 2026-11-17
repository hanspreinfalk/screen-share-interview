import Link from "next/link";
import type { ReactNode } from "react";

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
    <div className="friend-surface flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-8 pt-7 pb-4 md:px-12">
        <Link
          href="/"
          className="friend-brand text-[15px] tracking-[0.08em] text-black uppercase md:text-[16px]"
        >
          Pacific
        </Link>
        <Link
          href={altHref}
          className="friend-sans text-[13px] text-black/70 transition hover:text-black"
        >
          {altLabel}
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-20">
        <div className="mb-8 space-y-2 text-center">
          <h1 className="friend-name text-[1.85rem] leading-tight text-black">
            {heading}
          </h1>
          <p className="friend-sans text-[14px] text-black/45">{subheading}</p>
        </div>
        {children}
      </main>
    </div>
  );
}
