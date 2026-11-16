"use client";

import { useState } from "react";
import { ArrowUpRight, Check, Minus, Plus } from "lucide-react";

import { WorkflowDiagram } from "@/components/workflow-diagram";
import { cn } from "@/lib/utils";
import type {
  AgentOpportunity,
  AgentToolRef,
  AutomationReport,
  WorkflowModel,
} from "@/lib/workflow-model";

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

function SectionHeader({
  index,
  kicker,
  title,
  intro,
}: {
  index: string;
  kicker: string;
  title: string;
  intro?: string;
}) {
  return (
    <header className="space-y-6">
      <div className="flex items-baseline gap-4">
        <span className="pr-body text-xs tabular-nums text-[var(--pr-muted)]">
          {index}
        </span>
        <span className="pr-label">{kicker}</span>
      </div>
      <hr className="pr-rule" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] lg:items-start lg:gap-12">
        <h2 className="pr-display max-w-2xl text-[2rem] text-[var(--pr-ink)] sm:text-4xl md:text-[3.25rem]">
          {title}
        </h2>
        {intro ? (
          <p className="pr-body text-[15px] leading-[1.7] text-[var(--pr-muted)] lg:pt-2">
            {intro}
          </p>
        ) : null}
      </div>
    </header>
  );
}

function FieldBlock({
  label,
  children,
  light = false,
  className,
}: {
  label: string;
  children: React.ReactNode;
  light?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className={cn("pr-label mb-2.5", light && "pr-label-light")}>
        {label}
      </p>
      {children}
    </div>
  );
}

function BodyText({
  children,
  light = false,
  className,
}: {
  children: React.ReactNode;
  light?: boolean;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "pr-body text-[15px] leading-[1.65]",
        light ? "text-white/70" : "text-[var(--pr-soft)]",
        className,
      )}
    >
      {children}
    </p>
  );
}

function MarkedList({
  items,
  limit = 6,
  light = false,
}: {
  items: string[];
  limit?: number;
  light?: boolean;
}) {
  if (!items.length) return null;
  return (
    <ul className="space-y-2.5">
      {items.slice(0, limit).map((item) => (
        <li
          key={item}
          className={cn(
            "pr-body pr-arrow-item text-[14.5px] leading-[1.6]",
            light
              ? "pr-arrow-item-light text-white/70"
              : "text-[var(--pr-soft)]",
          )}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function toolStatusLabel(status: AgentToolRef["status"]) {
  switch (status) {
    case "verified":
      return "Ready";
    case "proposed":
      return "Likely";
    default:
      return "Needs work";
  }
}

function ToolChips({
  tools,
  limit = 8,
  light = false,
}: {
  tools: AgentToolRef[];
  limit?: number;
  light?: boolean;
}) {
  if (!tools.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {tools.slice(0, limit).map((tool) => (
        <span
          key={`${tool.name}-${tool.purpose}`}
          title={tool.purpose}
          className={cn("pr-chip pr-body", light && "pr-chip-light")}
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              tool.status === "verified"
                ? "bg-emerald-500"
                : tool.status === "proposed"
                  ? "bg-amber-500"
                  : light
                    ? "bg-white/35"
                    : "bg-black/25",
            )}
          />
          {tool.name}
          <span
            className={cn(
              "text-[11px]",
              light ? "text-white/45" : "text-[var(--pr-muted)]",
            )}
          >
            {toolStatusLabel(tool.status)}
          </span>
        </span>
      ))}
    </div>
  );
}

function feasibilityLabel(value: AgentOpportunity["feasibility"]["overall"]) {
  switch (value) {
    case "high":
      return "Buildable now";
    case "medium":
      return "Promising";
    default:
      return "Ambitious";
  }
}

/* ------------------------------------------------------------------ *
 * Section 02 — opportunity card
 * ------------------------------------------------------------------ */

function AgentCard({ agent }: { agent: AgentOpportunity }) {
  const [open, setOpen] = useState(false);
  const rank = String(agent.rank).padStart(2, "0");

  return (
    <article className="pr-card pr-card-hover">
      {/* Head: rank + name + mission */}
      <div className="grid gap-6 p-6 md:grid-cols-[4.5rem_minmax(0,1fr)] md:gap-8 md:p-9">
        <div className="flex items-start justify-between md:flex-col md:gap-4">
          <span className="pr-display text-[2.5rem] leading-none text-[var(--pr-ink)]/15">
            {rank}
          </span>
          <ArrowUpRight
            aria-hidden
            className="size-4 text-[var(--pr-muted)] md:hidden"
          />
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="pr-chip pr-body">
              {feasibilityLabel(agent.feasibility.overall)}
            </span>
            {agent.trigger.type !== "unknown" ? (
              <span className="pr-chip pr-body capitalize">
                {agent.trigger.type}
              </span>
            ) : null}
          </div>
          <h3 className="pr-display max-w-xl text-2xl text-[var(--pr-ink)] md:text-[2rem]">
            {agent.name}
          </h3>
          <BodyText className="max-w-2xl">{agent.mission}</BodyText>
        </div>
      </div>

      {/* Before / after contrast — the heart of the card */}
      <div className="grid border-t border-[var(--pr-line-soft)] md:grid-cols-2">
        <div className="border-b border-[var(--pr-line-soft)] p-6 md:border-r md:border-b-0 md:p-9">
          <FieldBlock label="Today">
            <BodyText className="text-[var(--pr-muted)]">
              {agent.currentWorkflow}
            </BodyText>
          </FieldBlock>
        </div>
        <div className="bg-[var(--pr-bg)]/70 p-6 md:p-9">
          <FieldBlock label="With an agent">
            <BodyText className="text-[var(--pr-ink)]">
              {agent.autonomousWorkflow}
            </BodyText>
          </FieldBlock>
        </div>
      </div>

      {/* Facts row */}
      <div className="grid gap-6 border-t border-[var(--pr-line-soft)] p-6 md:grid-cols-3 md:gap-8 md:p-9">
        <FieldBlock label="Starts when">
          <BodyText className="text-[14.5px]">{agent.trigger.detail}</BodyText>
        </FieldBlock>
        <FieldBlock label="Why it matters">
          <BodyText className="text-[14.5px]">{agent.impact.summary}</BodyText>
        </FieldBlock>
        <FieldBlock label="You stay involved for">
          <MarkedList items={agent.humanInvolvement} limit={3} />
        </FieldBlock>
      </div>

      {/* Expandable detail */}
      <div className="border-t border-[var(--pr-line-soft)]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="pr-body flex w-full items-center justify-between gap-4 px-6 py-5 text-left text-sm text-[var(--pr-ink)] transition-colors hover:bg-[var(--pr-bg)] md:px-9"
        >
          <span>{open ? "Hide the details" : "How it would work"}</span>
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[var(--pr-line)]">
            {open ? (
              <Minus aria-hidden className="size-3.5" />
            ) : (
              <Plus aria-hidden className="size-3.5" />
            )}
          </span>
        </button>

        {open ? (
          <div className="grid gap-8 border-t border-[var(--pr-line-soft)] bg-[var(--pr-bg)]/60 p-6 md:grid-cols-2 md:p-9">
            <FieldBlock label="Decisions it makes">
              <MarkedList items={agent.reasoning} />
            </FieldBlock>
            <FieldBlock label="How it checks success">
              <MarkedList items={agent.verification} />
            </FieldBlock>
            <FieldBlock label="If something fails">
              <MarkedList items={agent.recovery} />
            </FieldBlock>
            <FieldBlock label="Building blocks">
              <ToolChips tools={agent.tools} limit={6} />
            </FieldBlock>
          </div>
        ) : null}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

export function AutomationReportView({
  report,
  workflow,
  onNewSession,
}: {
  report: AutomationReport;
  workflow?: WorkflowModel | null;
  onNewSession?: () => void;
}) {
  const opportunities = [...report.agentOpportunities].sort(
    (a, b) => a.rank - b.rank,
  );
  const recommended = report.recommendedAgent;
  const stepCount = recommended.executionPlan.length;

  const heroStats = [
    { value: String(opportunities.length), label: "Agents worth building" },
    { value: String(stepCount), label: "Steps in the first build" },
    {
      value: String(report.howYouWorkToday.keyObservations.length),
      label: "Observations from your session",
    },
  ];

  return (
    <div className="pacific-report min-h-screen">
      {/* ---------------- Hero ---------------- */}
      <header className="pr-dark-panel pr-grain overflow-hidden">
        <div className="relative z-10 mx-auto w-full max-w-6xl px-5 py-7 md:px-10">
          <div className="flex items-center justify-between gap-4">
            <span className="pr-body text-sm tracking-[-0.02em] text-[var(--pr-cream)]">
              pacific.
            </span>
            <span className="pr-label pr-label-light hidden sm:block">
              Automation blueprint
            </span>
          </div>
        </div>

        <hr className="pr-rule pr-rule-light relative z-10 mx-auto max-w-6xl" />

        <div className="relative z-10 mx-auto w-full max-w-6xl px-5 pt-14 pb-12 md:px-10 md:pt-24 md:pb-16">
          <div className="max-w-3xl space-y-7">
            <p className="pr-label pr-label-light">Your session, analysed</p>
            <h1 className="pr-display text-[2.5rem] text-[var(--pr-cream)] sm:text-6xl md:text-[4.25rem]">
              Here&apos;s what we can automate.
            </h1>
            <p className="pr-body max-w-xl text-base leading-[1.7] text-white/65 md:text-lg">
              First the way you work today. Then the agents that could own the
              outcome — with as little hand-holding as possible.
            </p>
            {onNewSession ? (
              <div className="pt-2">
                <button type="button" className="pr-pill" onClick={onNewSession}>
                  Start a new session
                  <ArrowUpRight aria-hidden className="size-4" />
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Stat strip grounds the hero and kills the empty black gap */}
        <div className="relative z-10 border-t border-white/10">
          <div className="mx-auto grid w-full max-w-6xl grid-cols-1 sm:grid-cols-3">
            {heroStats.map((stat, i) => (
              <div
                key={stat.label}
                className={cn(
                  "px-5 py-6 md:px-10 md:py-8",
                  i > 0 && "border-t border-white/10 sm:border-t-0 sm:border-l",
                )}
              >
                <p className="pr-display text-3xl text-[var(--pr-cream)] md:text-4xl">
                  {stat.value}
                </p>
                <p className="pr-body mt-2 text-[13px] leading-5 text-white/50">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-24 px-5 py-20 md:gap-32 md:px-10 md:py-28">
        {/* ---------------- 01 — current workflow ---------------- */}
        <section className="space-y-10">
          <SectionHeader
            index="01"
            kicker="Current workflow"
            title="How you work today."
            intro="What Pacific saw during your session, in the order it happens."
          />

          <p className="pr-body max-w-3xl text-lg leading-[1.6] text-[var(--pr-soft)] md:text-xl md:leading-[1.55]">
            {report.howYouWorkToday.summary}
          </p>

          <WorkflowDiagram
            diagram={report.howYouWorkToday.diagram}
            workflow={workflow}
            variant="wonderful"
          />

          <div className="grid gap-5 md:grid-cols-2">
            <div className="pr-card p-6 md:p-8">
              <FieldBlock label="What stood out">
                <MarkedList items={report.howYouWorkToday.keyObservations} />
              </FieldBlock>
            </div>
            <div className="pr-card p-6 md:p-8">
              <FieldBlock label="Still unclear">
                {report.howYouWorkToday.uncertainties.length ? (
                  <MarkedList items={report.howYouWorkToday.uncertainties} />
                ) : (
                  <BodyText className="text-[var(--pr-muted)]">
                    Nothing major — the picture is clear enough to design from.
                  </BodyText>
                )}
              </FieldBlock>
            </div>
          </div>
        </section>

        {/* ---------------- 02 — opportunities ---------------- */}
        <section className="space-y-10">
          <SectionHeader
            index="02"
            kicker="Opportunities"
            title="Where an agent could take over."
            intro="Each one aims to finish the job end to end, not just speed up a single click."
          />
          <div className="space-y-5">
            {opportunities.map((agent) => (
              <AgentCard key={`${agent.rank}-${agent.name}`} agent={agent} />
            ))}
          </div>
        </section>

        {/* ---------------- 03 — recommended ---------------- */}
        <section className="space-y-10">
          <SectionHeader
            index="03"
            kicker="Recommended start"
            title="The best agent to build first."
          />

          <div className="pr-card">
            {/* Dark showcase head — the single hero moment of the page */}
            <div className="pr-dark-panel pr-grain relative overflow-hidden p-6 md:p-12">
              <div className="relative z-10 space-y-6">
                <div className="flex items-center gap-2">
                  <span className="pr-chip pr-chip-light pr-body">
                    <Check aria-hidden className="size-3" />
                    Recommended
                  </span>
                </div>
                <h3 className="pr-display max-w-3xl text-[1.75rem] text-[var(--pr-cream)] sm:text-4xl md:text-[3rem]">
                  {recommended.name}
                </h3>
                <BodyText light className="max-w-2xl text-base md:text-[17px]">
                  {recommended.why}
                </BodyText>
                <div className="pt-2">
                  <ToolChips tools={recommended.integrations} light limit={8} />
                </div>
              </div>
            </div>

            {/* Execution plan */}
            <div className="p-6 md:p-12">
              <FieldBlock label={`What it would do · ${stepCount} steps`}>
                <ol className="mt-1">
                  {recommended.executionPlan.map((step, index) => (
                    <li
                      key={step}
                      className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 border-b border-[var(--pr-line-soft)] py-4 last:border-b-0 md:gap-5"
                    >
                      <span className="pr-body pt-0.5 text-xs tabular-nums text-[var(--pr-muted)]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <BodyText className="text-[var(--pr-ink)]">
                        {step}
                      </BodyText>
                    </li>
                  ))}
                </ol>
              </FieldBlock>
            </div>

            {/* Operating details */}
            <div className="grid border-t border-[var(--pr-line-soft)] sm:grid-cols-2">
              {(
                [
                  ["How it knows it worked", recommended.verificationStrategy],
                  ["If something goes wrong", recommended.recoveryStrategy],
                  ["Where you approve", recommended.humanApprovalStrategy],
                  ["How realistic this is", recommended.feasibilityAssessment],
                ] as const
              ).map(([label, body], i) => (
                <div
                  key={label}
                  className={cn(
                    "p-6 md:p-9",
                    "border-b border-[var(--pr-line-soft)]",
                    i % 2 === 0 && "sm:border-r",
                    i >= 2 && "sm:border-b-0",
                  )}
                >
                  <FieldBlock label={label}>
                    <BodyText className="text-[14.5px]">{body}</BodyText>
                  </FieldBlock>
                </div>
              ))}
            </div>

            {/* Architecture + constraint */}
            <div className="grid gap-6 border-t border-[var(--pr-line-soft)] bg-[var(--pr-bg)]/60 p-6 md:grid-cols-2 md:gap-10 md:p-9">
              <FieldBlock label="How it would be put together">
                <BodyText className="text-[14.5px]">
                  {recommended.architecture}
                </BodyText>
              </FieldBlock>
              <div className="pr-dark-panel rounded-[1.1rem] p-5 md:p-6">
                <FieldBlock label="One thing to design around" light>
                  <BodyText light className="text-[14.5px]">
                    {recommended.environmentConstraints}
                  </BodyText>
                </FieldBlock>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- 04 — open questions ---------------- */}
        <section className="space-y-10">
          <SectionHeader
            index="04"
            kicker="Open questions"
            title="A few things to confirm."
            intro="None of these block a start — they just shape how the first agent gets built."
          />
          {report.stillNeedsToKnow.length ? (
            <ol className="pr-card divide-y divide-[var(--pr-line-soft)]">
              {report.stillNeedsToKnow.slice(0, 8).map((question, index) => (
                <li
                  key={question}
                  className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 p-6 md:gap-5 md:px-9"
                >
                  <span className="pr-body pt-0.5 text-xs tabular-nums text-[var(--pr-muted)]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <BodyText className="text-[var(--pr-ink)]">
                    {question}
                  </BodyText>
                </li>
              ))}
            </ol>
          ) : (
            <div className="pr-card p-6 md:p-9">
              <BodyText className="text-[var(--pr-muted)]">
                Nothing blocking — there&apos;s enough here to start designing.
              </BodyText>
            </div>
          )}
        </section>
      </main>

      {/* ---------------- Footer ---------------- */}
      <footer className="pr-dark-panel pr-grain overflow-hidden">
        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-14 md:flex-row md:items-end md:justify-between md:px-10 md:py-20">
          <div className="max-w-xl space-y-4">
            <p className="pr-label pr-label-light">End of blueprint</p>
            <p className="pr-display text-2xl text-[var(--pr-cream)] md:text-[2.5rem]">
              Want to go deeper on one of these?
            </p>
            <BodyText light className="max-w-md">
              Run another session and walk through the workflow again — the more
              Pacific sees, the sharper the plan.
            </BodyText>
          </div>
          {onNewSession ? (
            <button
              type="button"
              className="pr-pill pr-pill-ghost shrink-0"
              onClick={onNewSession}
            >
              Start a new session
              <ArrowUpRight aria-hidden className="size-4" />
            </button>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
