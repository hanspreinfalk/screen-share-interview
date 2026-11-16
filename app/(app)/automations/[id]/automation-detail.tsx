"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CaretLeft, CheckCircle, Warning } from "@phosphor-icons/react";

import { AppLogo } from "@/components/app-logo";
import { RunButton } from "@/components/automations/run-button";
import { TriggerEditor } from "@/components/automations/trigger-editor";
import {
  ErrorNote,
  Skeleton,
  StatusPill,
} from "@/components/pacific/primitives";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { Id } from "@/convex/_generated/dataModel";
import { automationsApi, type AutomationExecution } from "@/lib/automations-api";
import {
  automationStatusLabel,
  executionStatusLabel,
  formatDateTime,
  formatRelative,
  stepStatusLabel,
  triggerSummary,
} from "@/lib/status";
import { toolkitDisplayName } from "@/lib/toolkit";

export function AutomationDetail({ id }: { id: Id<"automations"> }) {
  const router = useRouter();

  const detail = useQuery(automationsApi.get, { id });
  const executions = useQuery(automationsApi.listExecutions, {
    automationId: id,
  });

  const setStatus = useMutation(automationsApi.setStatus);
  const remove = useMutation(automationsApi.remove);

  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"status" | "delete" | null>(null);

  const isPaused = detail?.status === "paused";
  const latest = executions?.[0];

  async function onPauseResume() {
    setActionError(null);
    setBusy("status");
    try {
      await setStatus({ id, status: isPaused ? "active" : "paused" });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not update status",
      );
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (!window.confirm("Delete this automation? This cannot be undone.")) {
      return;
    }
    setActionError(null);
    setBusy("delete");
    try {
      await remove({ id });
      router.push("/automations");
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not delete automation",
      );
      setBusy(null);
    }
  }

  if (detail === undefined) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4 px-6 py-10">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  if (detail === null) {
    return (
      <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="pr-display text-[1.4rem] text-[var(--pr-ink)]">
          This automation does not exist
        </p>
        <Link
          href="/automations"
          className="text-[13px] text-[var(--pr-muted)] hover:text-[var(--pr-ink)]"
        >
          Back to automations
        </Link>
      </div>
    );
  }

  const status = automationStatusLabel(detail.status);
  const verified = Boolean(detail.verifiedAt);
  const missingConnections = detail.requiredConnections.filter(
    (connection) => connection.status !== "connected",
  );

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-[var(--pr-line)]">
        <div className="mx-auto w-full max-w-4xl px-6 py-5 md:px-8">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="md:hidden" />
            <Link
              href="/automations"
              className="inline-flex items-center gap-1 text-[12px] text-[var(--pr-muted)] transition-colors hover:text-[var(--pr-ink)]"
            >
              <CaretLeft size={12} weight="bold" />
              Automations
            </Link>
          </div>

          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="pr-display text-[1.75rem] leading-tight text-[var(--pr-ink)]">
                {detail.name}
              </h1>
              <p className="mt-1.5 text-[13px] text-[var(--pr-muted)]">
                {triggerSummary(detail.trigger)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill label={status.label} tone={status.tone} />
              <RunButton
                automationId={detail._id}
                label={verified ? "Run" : "Test"}
                test={!verified}
              />
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void onPauseResume()}
                className="rounded-full border border-[var(--pr-line)] px-3.5 py-1.5 text-[12.5px] text-[var(--pr-soft)] transition-colors hover:bg-[var(--pr-ink)]/[0.03] disabled:opacity-50"
              >
                {isPaused ? "Resume" : "Pause"}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl flex-1 space-y-8 px-6 py-8 md:px-8">
        {actionError ? <ErrorNote message={actionError} /> : null}

        {/* The one thing a user most wants to know, stated plainly. */}
        <section
          className={
            verified
              ? "flex items-start gap-3 rounded-2xl border border-[var(--pr-good)]/20 bg-[var(--pr-good-bg)] p-4"
              : "flex items-start gap-3 rounded-2xl border border-[var(--pr-warn)]/25 bg-[var(--pr-warn-bg)] p-4"
          }
        >
          {verified ? (
            <CheckCircle
              size={20}
              weight="fill"
              className="mt-0.5 shrink-0 text-[var(--pr-good)]"
            />
          ) : (
            <Warning
              size={20}
              weight="fill"
              className="mt-0.5 shrink-0 text-[var(--pr-warn)]"
            />
          )}
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-[var(--pr-ink)]">
              {verified
                ? `Verified working ${formatRelative(detail.verifiedAt)}`
                : "Not verified yet"}
            </p>
            <p className="mt-0.5 text-[13px] leading-6 text-[var(--pr-soft)]">
              {verified
                ? latest?.verification?.summary ??
                  "A real run completed and was checked end to end."
                : missingConnections.length
                  ? `Connect ${missingConnections
                      .map((c) => toolkitDisplayName(c.toolkit))
                      .join(", ")} first, then run a test.`
                  : "Run a test to confirm it does what you expect before relying on it."}
            </p>
          </div>
        </section>

        {detail.description ? (
          <section className="space-y-2">
            <h2 className="pr-label">What it does</h2>
            <p className="text-[14px] leading-7 text-[var(--pr-soft)]">
              {detail.description}
            </p>
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="pr-label">Steps</h2>
          <ol className="space-y-2">
            {detail.steps.map((step, index) => {
              const result = latest?.stepResults.find(
                (item) => item.stepId === step.id,
              );
              const stepStatus = result
                ? stepStatusLabel(result.status)
                : null;
              return (
                <li
                  key={step.id}
                  className="flex items-start gap-3 rounded-2xl border border-[var(--pr-line)] bg-white p-4"
                >
                  <span className="pr-display mt-0.5 w-5 shrink-0 text-[13px] text-[var(--pr-ink)]/35">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14px] text-[var(--pr-ink)]">
                        {step.title}
                      </p>
                      {step.requiresApproval ? (
                        <StatusPill
                          label="Asks you first"
                          tone="neutral"
                          dot={false}
                        />
                      ) : null}
                      {stepStatus ? (
                        <StatusPill
                          label={stepStatus.label}
                          tone={stepStatus.tone}
                        />
                      ) : null}
                    </div>
                    {result?.summary ? (
                      <p className="mt-1 text-[12.5px] leading-5 text-[var(--pr-muted)]">
                        {result.summary}
                      </p>
                    ) : null}
                    {result?.error ? (
                      <p className="mt-1 text-[12.5px] leading-5 text-[var(--pr-danger)]">
                        {result.error}
                      </p>
                    ) : null}
                    {step.toolkit || step.toolSlug ? (
                      <div className="mt-2 flex items-center gap-1.5">
                        {step.toolkit ? (
                          <AppLogo name={step.toolkit} size={12} />
                        ) : null}
                        <span className="font-mono text-[11px] text-[var(--pr-muted)]">
                          {step.toolSlug ?? step.toolkit}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {detail.requiredConnections.length > 0 ? (
          <section className="space-y-3">
            <h2 className="pr-label">Connections</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {detail.requiredConnections.map((connection, index) => {
                const connected = connection.status === "connected";
                return (
                  <li
                    key={`${connection.toolkit}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--pr-line)] bg-white px-3.5 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <AppLogo name={connection.toolkit} size={15} />
                      <span className="truncate text-[13.5px] text-[var(--pr-ink)]">
                        {toolkitDisplayName(connection.toolkit)}
                      </span>
                    </div>
                    {connected ? (
                      <StatusPill label="Connected" tone="good" />
                    ) : (
                      <Link
                        href="/integrations"
                        className="shrink-0 rounded-full bg-[var(--pr-dark)] px-3 py-1.5 text-[12px] text-[var(--pr-cream)] transition-colors hover:bg-[var(--pr-dark-hover)]"
                      >
                        Connect
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="pr-label">Trigger</h2>
          <TriggerEditor
            automationId={detail._id}
            trigger={detail.trigger}
            toolkits={detail.requiredToolkits}
          />
        </section>

        <section className="space-y-3">
          <h2 className="pr-label">Run history</h2>
          {executions === undefined ? (
            <Skeleton className="h-24 rounded-2xl" />
          ) : executions.length === 0 ? (
            <p className="text-[13px] text-[var(--pr-muted)]">
              No runs yet.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--pr-line-soft)] overflow-hidden rounded-2xl border border-[var(--pr-line)] bg-white">
              {executions.slice(0, 10).map((execution) => (
                <ExecutionRow key={execution._id} execution={execution} />
              ))}
            </ul>
          )}
        </section>

        <section className="border-t border-[var(--pr-line)] pt-6">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void onDelete()}
            className="rounded-full px-3 py-1.5 text-[12.5px] text-[var(--pr-muted)] transition-colors hover:bg-[var(--pr-danger-bg)] hover:text-[var(--pr-danger)] disabled:opacity-50"
          >
            {busy === "delete" ? "Deleting" : "Delete automation"}
          </button>
        </section>
      </div>
    </div>
  );
}

/** One run, with the honest outcome and any approval the user owes. */
function ExecutionRow({ execution }: { execution: AutomationExecution }) {
  const approveStep = useMutation(automationsApi.approveStep);
  const [approving, setApproving] = useState(false);
  const status = executionStatusLabel(
    execution.status,
    execution.verification?.verified,
  );
  const pendingStep = execution.stepResults.find(
    (step) => step.status === "awaiting_approval",
  );

  return (
    <li className="flex flex-col gap-2 px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13.5px] text-[var(--pr-ink)]">
            {formatDateTime(execution.startedAt)}
          </p>
          <p className="text-[11.5px] text-[var(--pr-muted)]">
            {execution.triggerSource === "test"
              ? "Test run"
              : execution.triggerSource.replace(/_/g, " ")}
          </p>
        </div>
        <StatusPill label={status.label} tone={status.tone} />
      </div>

      {execution.verification?.summary ? (
        <p className="text-[12.5px] leading-5 text-[var(--pr-soft)]">
          {execution.verification.summary}
        </p>
      ) : null}

      {execution.error ? (
        <p className="text-[12.5px] leading-5 text-[var(--pr-danger)]">
          {execution.error}
        </p>
      ) : null}

      {pendingStep ? (
        <button
          type="button"
          disabled={approving}
          onClick={() => {
            setApproving(true);
            void approveStep({
              executionId: execution._id,
              stepId: pendingStep.stepId,
            }).finally(() => setApproving(false));
          }}
          className="self-start rounded-full bg-[var(--pr-dark)] px-3.5 py-1.5 text-[12px] text-[var(--pr-cream)] transition-colors hover:bg-[var(--pr-dark-hover)] disabled:opacity-60"
        >
          {approving ? "Approving" : "Approve and continue"}
        </button>
      ) : null}
    </li>
  );
}
