"use client";

import Link from "next/link";

import { RunButton } from "@/components/automations/run-button";
import { StatusPill } from "@/components/pacific/primitives";
import { AppLogo } from "@/components/app-logo";
import {
  automationStatusLabel,
  formatRelative,
  triggerSummary,
} from "@/lib/status";
import type { AutomationSummary } from "@/lib/automations-api";
import { cn } from "@/lib/utils";

/**
 * One automation at a glance.
 *
 * The question a user actually has is "does this work?", so verification is
 * the headline, not the internal status enum.
 */
export function AutomationCard({
  automation,
  className,
}: {
  automation: AutomationSummary;
  className?: string;
}) {
  const href = `/automations/${automation._id}`;
  const status = automationStatusLabel(automation.status);
  const tested = Boolean(automation.verifiedAt);
  const toolkits = automation.requiredToolkits.slice(0, 4);

  return (
    <article
      className={cn(
        "group flex flex-col gap-4 rounded-2xl border border-[var(--pr-line)] bg-white p-5 transition-colors hover:border-[var(--pr-ink)]/15",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <Link href={href} className="min-w-0 flex-1">
          <h3 className="pr-display truncate text-[1.2rem] leading-tight text-[var(--pr-ink)] group-hover:underline">
            {automation.name || "Untitled automation"}
          </h3>
          <p className="mt-1 text-[12.5px] text-[var(--pr-muted)]">
            {triggerSummary(automation.trigger)}
          </p>
        </Link>
        <StatusPill label={status.label} tone={status.tone} />
      </div>

      {automation.description ? (
        <p className="line-clamp-2 text-[13.5px] leading-6 text-[var(--pr-soft)]">
          {automation.description}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-[var(--pr-line-soft)] pt-3.5">
        <div className="flex min-w-0 items-center gap-3">
          {toolkits.length ? (
            <div className="flex items-center -space-x-1.5">
              {toolkits.map((toolkit) => (
                <span
                  key={toolkit}
                  title={toolkit}
                  className="inline-flex size-7 items-center justify-center rounded-full border border-[var(--pr-line)] bg-white"
                >
                  <AppLogo name={toolkit} size={13} />
                </span>
              ))}
            </div>
          ) : null}
          <span className="truncate text-[12px] text-[var(--pr-muted)]">
            {tested
              ? `Verified ${formatRelative(automation.verifiedAt)}`
              : "Not verified yet"}
          </span>
        </div>

        <RunButton
          automationId={automation._id}
          label={tested ? "Run" : "Test"}
          test={!tested}
        />
      </div>
    </article>
  );
}
