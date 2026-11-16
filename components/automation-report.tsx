"use client";

import { useState } from "react";
import { ArrowUpRight, ChevronDown } from "lucide-react";

import { WorkflowDiagram } from "@/components/workflow-diagram";
import { cn } from "@/lib/utils";
import type {
  AgentOpportunity,
  AgentToolRef,
  AutomationReport,
  WorkflowModel,
} from "@/lib/workflow-model";

function SectionHeading({
  kicker,
  title,
  light = false,
}: {
  kicker: string;
  title: string;
  light?: boolean;
}) {
  return (
    <div className="max-w-3xl space-y-4">
      <p
        className={cn(
          "pr-body text-sm",
          light ? "text-white/55" : "text-[var(--pr-muted)]",
        )}
      >
        {kicker}
      </p>
      <h2
        className={cn(
          "pr-display text-3xl md:text-5xl",
          light ? "text-[var(--pr-cream)]" : "text-[var(--pr-soft)]",
        )}
      >
        {title}
      </h2>
    </div>
  );
}

function QuietList({ items, limit = 4 }: { items: string[]; limit?: number }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-3">
      {items.slice(0, limit).map((item) => (
        <li
          key={item}
          className="pr-body border-l border-black/10 pl-3 text-[15px] leading-6 text-[var(--pr-muted)]"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function statusLabel(status: AgentToolRef["status"]) {
  switch (status) {
    case "verified":
      return "Ready";
    case "proposed":
      return "Likely";
    default:
      return "Needs work";
  }
}

function feasibilityLabel(value: AgentOpportunity["feasibility"]["overall"]) {
  switch (value) {
    case "high":
      return "Looks buildable";
    case "medium":
      return "Promising";
    default:
      return "Harder";
  }
}

function AgentCard({ agent }: { agent: AgentOpportunity }) {
  const [open, setOpen] = useState(false);

  return (
    <article className="pr-card">
      <div className="pr-dark-panel relative min-h-[220px] p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <p className="pr-body text-sm text-white/55">
            Idea {agent.rank} · {feasibilityLabel(agent.feasibility.overall)}
          </p>
          <ArrowUpRight className="size-5 text-white/70" />
        </div>
        <h3 className="pr-display mt-10 max-w-xl text-3xl text-[var(--pr-cream)] md:text-4xl">
          {agent.name}
        </h3>
        <p className="pr-body mt-4 max-w-2xl text-[15px] leading-7 text-white/70">
          {agent.mission}
        </p>
      </div>

      <div className="space-y-6 p-6 md:p-8">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <p className="pr-body mb-2 text-sm text-[var(--pr-muted)]">Today</p>
            <p className="pr-body text-[15px] leading-7 text-[var(--pr-ink)]">
              {agent.currentWorkflow}
            </p>
          </div>
          <div>
            <p className="pr-body mb-2 text-sm text-[var(--pr-muted)]">
              With an agent
            </p>
            <p className="pr-body text-[15px] leading-7 text-[var(--pr-ink)]">
              {agent.autonomousWorkflow}
            </p>
          </div>
        </div>

        <div className="grid gap-4 border-t border-black/5 pt-6 sm:grid-cols-3">
          <div>
            <p className="pr-body mb-2 text-sm text-[var(--pr-muted)]">
              Starts when
            </p>
            <p className="pr-body text-[15px] leading-6 text-[var(--pr-ink)]">
              {agent.trigger.detail}
            </p>
          </div>
          <div>
            <p className="pr-body mb-2 text-sm text-[var(--pr-muted)]">
              Why it matters
            </p>
            <p className="pr-body text-[15px] leading-6 text-[var(--pr-ink)]">
              {agent.impact.summary}
            </p>
          </div>
          <div>
            <p className="pr-body mb-2 text-sm text-[var(--pr-muted)]">
              You stay involved for
            </p>
            <QuietList items={agent.humanInvolvement} limit={3} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="pr-body inline-flex items-center gap-2 text-sm text-[var(--pr-ink)]"
        >
          {open ? "Hide details" : "Show how it would work"}
          <ChevronDown
            className={cn("size-4 transition-transform", open && "rotate-180")}
          />
        </button>

        {open ? (
          <div className="grid gap-6 border-t border-black/5 pt-6 md:grid-cols-2">
            <div>
              <p className="pr-body mb-2 text-sm text-[var(--pr-muted)]">
                Decisions it makes
              </p>
              <QuietList items={agent.reasoning} />
            </div>
            <div>
              <p className="pr-body mb-2 text-sm text-[var(--pr-muted)]">
                How it checks success
              </p>
              <QuietList items={agent.verification} />
            </div>
            <div>
              <p className="pr-body mb-2 text-sm text-[var(--pr-muted)]">
                If something fails
              </p>
              <QuietList items={agent.recovery} />
            </div>
            <div>
              <p className="pr-body mb-2 text-sm text-[var(--pr-muted)]">
                Building blocks
              </p>
              <div className="flex flex-wrap gap-2">
                {agent.tools.slice(0, 6).map((tool) => (
                  <span
                    key={`${tool.name}-${tool.purpose}`}
                    className="pr-body rounded-full border border-black/8 bg-[var(--pr-bg)] px-3 py-1.5 text-xs text-[var(--pr-ink)]"
                  >
                    {tool.name}
                    <span className="ml-2 text-[var(--pr-muted)]">
                      {statusLabel(tool.status)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

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

  return (
    <div className="pacific-report min-h-screen">
      <header className="pr-dark-panel px-4 py-10 md:px-8 md:py-16">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="pr-body text-sm tracking-[-0.02em] text-white/70">
              pacific.
            </p>
            {onNewSession ? (
              <button type="button" className="pr-pill" onClick={onNewSession}>
                New session
              </button>
            ) : null}
          </div>

          <div className="max-w-4xl space-y-6">
            <h1 className="pr-display text-4xl text-[var(--pr-cream)] md:text-6xl lg:text-[4.5rem]">
              Here&apos;s what we can automate.
            </h1>
            <p className="pr-body max-w-2xl text-lg leading-8 text-white/70 md:text-xl">
              First the way you work today. Then agents that can own the outcome
              with as little hand-holding as possible.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-20 px-4 py-14 md:px-8 md:py-20">
        <section className="space-y-8">
          <SectionHeading
            kicker="01 — Current workflow"
            title="How you work today."
          />
          <WorkflowDiagram
            diagram={report.howYouWorkToday.diagram}
            workflow={workflow}
            variant="wonderful"
          />
          <p className="pr-body max-w-3xl text-lg leading-8 text-[var(--pr-soft)]">
            {report.howYouWorkToday.summary}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="pr-card p-6">
              <p className="pr-body mb-4 text-sm text-[var(--pr-muted)]">
                What stood out
              </p>
              <QuietList items={report.howYouWorkToday.keyObservations} />
            </div>
            <div className="pr-card p-6">
              <p className="pr-body mb-4 text-sm text-[var(--pr-muted)]">
                Still unclear
              </p>
              {report.howYouWorkToday.uncertainties.length ? (
                <QuietList items={report.howYouWorkToday.uncertainties} />
              ) : (
                <p className="pr-body text-[15px] text-[var(--pr-muted)]">
                  Nothing major.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-8">
          <SectionHeading
            kicker="02 — Opportunities"
            title="Solving the parts that move the work."
          />
          <p className="pr-body max-w-2xl text-[15px] leading-7 text-[var(--pr-muted)]">
            A few ambitious agents — each one aims to finish the job, not just
            speed up one click.
          </p>
          <div className="space-y-6">
            {opportunities.map((agent) => (
              <AgentCard key={`${agent.rank}-${agent.name}`} agent={agent} />
            ))}
          </div>
        </section>

        <section className="space-y-8">
          <SectionHeading
            kicker="03 — Recommended start"
            title="The best agent to build first."
          />

          <div className="pr-card overflow-hidden">
            <div className="pr-dark-panel space-y-5 p-6 md:p-10">
              <p className="pr-body text-sm text-white/55">Recommended</p>
              <h3 className="pr-display max-w-3xl text-3xl text-[var(--pr-cream)] md:text-5xl">
                {report.recommendedAgent.name}
              </h3>
              <p className="pr-body max-w-3xl text-lg leading-8 text-white/70">
                {report.recommendedAgent.why}
              </p>
            </div>

            <div className="space-y-10 p-6 md:p-10">
              <div>
                <p className="pr-body mb-5 text-sm text-[var(--pr-muted)]">
                  What the agent would do
                </p>
                <ol className="space-y-4">
                  {report.recommendedAgent.executionPlan.map((step, index) => (
                    <li
                      key={step}
                      className="flex gap-4 border-b border-black/5 pb-4 last:border-b-0"
                    >
                      <span className="pr-display w-8 shrink-0 text-xl text-[var(--pr-soft)]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="pr-body text-[15px] leading-7 text-[var(--pr-ink)]">
                        {step}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {[
                  ["How it knows it worked", report.recommendedAgent.verificationStrategy],
                  ["If something goes wrong", report.recommendedAgent.recoveryStrategy],
                  ["Where you approve", report.recommendedAgent.humanApprovalStrategy],
                  ["How realistic is this?", report.recommendedAgent.feasibilityAssessment],
                ].map(([title, body]) => (
                  <div key={title} className="rounded-2xl bg-[var(--pr-bg)] p-5">
                    <p className="pr-body mb-2 text-sm text-[var(--pr-muted)]">
                      {title}
                    </p>
                    <p className="pr-body text-[15px] leading-7 text-[var(--pr-ink)]">
                      {body}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl bg-[var(--pr-dark)] p-5 md:p-6">
                <p className="pr-body mb-2 text-sm text-white/55">
                  Important constraint
                </p>
                <p className="pr-body text-[15px] leading-7 text-white/80">
                  {report.recommendedAgent.environmentConstraints}
                </p>
              </div>

              <div>
                <p className="pr-body mb-4 text-sm text-[var(--pr-muted)]">
                  Building blocks
                </p>
                <div className="mb-4 flex flex-wrap gap-2">
                  {report.recommendedAgent.integrations.map((tool) => (
                    <span
                      key={`${tool.name}-${tool.purpose}`}
                      className="pr-body rounded-full border border-black/8 bg-white px-3 py-1.5 text-xs text-[var(--pr-ink)]"
                    >
                      {tool.name}
                      <span className="ml-2 text-[var(--pr-muted)]">
                        {statusLabel(tool.status)}
                      </span>
                    </span>
                  ))}
                </div>
                <p className="pr-body max-w-3xl text-[15px] leading-7 text-[var(--pr-muted)]">
                  {report.recommendedAgent.architecture}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-6 pb-10">
          <SectionHeading
            kicker="04 — Open questions"
            title="A few things to confirm."
          />
          {report.stillNeedsToKnow.length > 0 ? (
            <QuietList items={report.stillNeedsToKnow} limit={8} />
          ) : (
            <p className="pr-body text-[15px] text-[var(--pr-muted)]">
              Nothing blocking for now — enough to start designing.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
