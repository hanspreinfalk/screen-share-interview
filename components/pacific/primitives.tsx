"use client";

import { cn } from "@/lib/utils";

export type StatusTone = "good" | "warn" | "danger" | "neutral" | "active";

/**
 * The single status indicator for the whole product.
 *
 * Previously three different primitives (pill, chip, square badge) rendered
 * status in three different visual languages. One component keeps every
 * surface consistent: automations, integrations, runs, and the live call.
 */
export function StatusDot({
  tone,
  className,
}: {
  tone: StatusTone;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        tone === "good" && "bg-[var(--pr-good)]",
        tone === "warn" && "bg-[var(--pr-warn)]",
        tone === "danger" && "bg-[var(--pr-danger)]",
        tone === "active" && "animate-pulse bg-[var(--pr-good)]",
        tone === "neutral" && "bg-[var(--pr-muted)]/45",
        className,
      )}
    />
  );
}

export function StatusPill({
  label,
  tone = "neutral",
  dot = true,
  className,
}: {
  label: string;
  tone?: StatusTone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-[0.02em] whitespace-nowrap",
        tone === "good" &&
          "border-[var(--pr-good)]/20 bg-[var(--pr-good-bg)] text-[var(--pr-good)]",
        tone === "active" &&
          "border-[var(--pr-good)]/20 bg-[var(--pr-good-bg)] text-[var(--pr-good)]",
        tone === "warn" &&
          "border-[var(--pr-warn)]/20 bg-[var(--pr-warn-bg)] text-[var(--pr-warn)]",
        tone === "danger" &&
          "border-[var(--pr-danger-line)] bg-[var(--pr-danger-bg)] text-[var(--pr-danger)]",
        tone === "neutral" &&
          "border-[var(--pr-line)] bg-[var(--pr-cream)] text-[var(--pr-muted)]",
        className,
      )}
    >
      {dot ? <StatusDot tone={tone} /> : null}
      {label}
    </span>
  );
}

/** Consistent loading placeholder, replacing four inline skeleton variants. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-xl bg-[var(--pr-ink)]/[0.045]",
        className,
      )}
    />
  );
}

/** Inline error surface with one consistent treatment across every screen. */
export function ErrorNote({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <p
      role="alert"
      className={cn(
        "rounded-xl border border-[var(--pr-danger-line)] bg-[var(--pr-danger-bg)] px-3.5 py-2.5 text-[13px] leading-5 text-[var(--pr-danger)]",
        className,
      )}
    >
      {message}
    </p>
  );
}

/** Page header shared by every workspace screen, so titles never drift. */
export function PageHeader({
  eyebrow,
  title,
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="border-b border-[var(--pr-line)]">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-6 py-5 md:px-8">
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <p className="pr-label !text-[10px]">{eyebrow}</p>
          ) : null}
          <h1 className="pr-display mt-1 text-[1.6rem] leading-tight text-[var(--pr-ink)]">
            {title}
          </h1>
          {children}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}

/** Centered empty state with one optional action. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[18rem] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--pr-line)] px-6 py-12 text-center">
      {icon ? <div className="text-[var(--pr-muted)]">{icon}</div> : null}
      <p className="pr-display text-[1.35rem] text-[var(--pr-ink)]">{title}</p>
      {description ? (
        <p className="max-w-sm text-[13.5px] leading-6 text-[var(--pr-muted)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
