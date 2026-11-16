"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Lightning } from "@phosphor-icons/react";

import { AutomationCard } from "@/components/automations/automation-card";
import {
  EmptyState,
  PageHeader,
  Skeleton,
} from "@/components/pacific/primitives";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { automationsApi } from "@/lib/automations-api";

export default function AutomationsPage() {
  const automations = useQuery(automationsApi.list);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PageHeader
        eyebrow="Workspace"
        title="Automations"
        actions={
          <>
            <SidebarTrigger className="md:hidden" />
            <Link
              href="/interview"
              className="inline-flex items-center rounded-full bg-[var(--pr-dark)] px-4 py-2 text-[13px] text-[var(--pr-cream)] transition-colors hover:bg-[var(--pr-dark-hover)]"
            >
              New automation
            </Link>
          </>
        }
      />

      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-8 md:px-8">
        {automations === undefined ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        ) : automations.length === 0 ? (
          <EmptyState
            icon={<Lightning size={26} />}
            title="No automations yet"
            description="Pacific builds these from a short voice call. Talk through one thing you repeat, and it will build and test it with you."
            action={
              <Link
                href="/interview"
                className="inline-flex items-center rounded-full bg-[var(--pr-dark)] px-5 py-2.5 text-[13px] text-[var(--pr-cream)] transition-colors hover:bg-[var(--pr-dark-hover)]"
              >
                Start a call
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {automations.map((automation) => (
              <AutomationCard key={automation._id} automation={automation} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
