"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import {
  CaretLeft,
  CaretRight,
  Microphone,
  MicrophoneSlash,
  Pause,
  PhoneDisconnect,
  Play,
} from "@phosphor-icons/react";

import { AppLogo } from "@/components/app-logo";
import { WorkflowDiagram } from "@/components/workflow-diagram";
import type {
  AgentReadiness,
  AutomationProposal,
  IntegrationRequirement,
  LiveWorkflowDiagram,
} from "@/lib/interview-artifacts";
import type { TranscriptLine } from "@/lib/session-types";
import { formatClock, SESSION_LIMIT_SECONDS } from "@/lib/use-session-clock";
import { cn } from "@/lib/utils";

export type VoiceState =
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "muted"
  | "paused"
  | "idle";

const IDLE_WAVE = [0.35, 0.55, 0.8, 1, 0.72, 1, 0.8, 0.55, 0.35] as const;

/**
 * Sound-wave presence for the live call. When `levels` are provided they
 * come from real mic / AI audio. Otherwise idle CSS motion is used.
 */
export function VoiceOrb({
  state,
  levels,
}: {
  state: VoiceState;
  levels?: number[];
}) {
  const live = Boolean(levels?.length);
  const speaking = state === "speaking";
  const thinking = state === "thinking";
  const listening = state === "listening";
  const connecting = state === "connecting";
  const muted = state === "muted";
  const paused = state === "paused";
  const bars = levels?.length ? levels : [...IDLE_WAVE];

  return (
    <div
      className={cn(
        "pr-wave relative flex h-[120px] w-[220px] items-center justify-center gap-[5px]",
        live && "pr-wave-live",
        !live && speaking && "pr-wave-speaking",
        !live && thinking && "pr-wave-thinking",
        !live && listening && "pr-wave-listening",
        !live && connecting && "pr-wave-connecting",
        (muted || paused) && "pr-wave-quiet",
      )}
      aria-hidden
    >
      {bars.map((amp, index) => (
        <span
          key={index}
          className="pr-wave-bar"
          style={
            {
              "--pr-wave-amp": Math.max(0.06, Math.min(1, amp)),
              "--pr-wave-delay": `${index * 70}ms`,
              height: live
                ? `${Math.round(10 + Math.max(0.06, Math.min(1, amp)) * 70)}px`
                : undefined,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

export function CallStatusLabel({ state }: { state: VoiceState }) {
  const label =
    state === "connecting"
      ? "Connecting"
      : state === "speaking"
        ? "Pacific is speaking"
        : state === "thinking"
          ? "Pacific is thinking"
          : state === "paused"
            ? "Call paused"
            : state === "muted"
              ? "You are muted"
              : state === "listening"
                ? "Listening"
                : "Ready";

  return (
    <p
      className="pr-body text-[15px] tracking-[-0.01em] text-[var(--pr-soft)]"
      aria-live="polite"
    >
      {label}
    </p>
  );
}

export function Countdown({
  remaining,
  isFinalMinute,
}: {
  remaining: number;
  isFinalMinute: boolean;
}) {
  const size = 26;
  const stroke = 2;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = Math.min(1, Math.max(0, remaining / SESSION_LIMIT_SECONDS));

  return (
    <span
      className="flex items-center gap-2"
      role="timer"
      aria-live="off"
      aria-label={`${formatClock(remaining)} remaining`}
    >
      <svg width={size} height={size} aria-hidden className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(23,23,25,0.1)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={isFinalMinute ? "#c2761f" : "rgba(23,23,25,0.55)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          style={{ transition: "stroke-dashoffset 500ms linear" }}
        />
      </svg>
      <span
        className={cn(
          "pr-body text-[13px] tabular-nums",
          isFinalMinute ? "text-[#a8641a]" : "text-[var(--pr-muted)]",
        )}
      >
        {formatClock(remaining)}
      </span>
    </span>
  );
}

/** FaceTime-style call controls kept available throughout the live call. */
export function CallControls({
  muted,
  paused,
  onToggleMute,
  onTogglePause,
  onEnd,
}: {
  muted: boolean;
  paused: boolean;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onEnd: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-3">
      <ControlButton
        label={muted ? "Unmute" : "Mute"}
        active={muted}
        onClick={onToggleMute}
      >
        {muted ? (
          <MicrophoneSlash size={22} weight="regular" />
        ) : (
          <Microphone size={22} weight="regular" />
        )}
      </ControlButton>
      <ControlButton
        label={paused ? "Resume" : "Pause"}
        active={paused}
        onClick={onTogglePause}
      >
        {paused ? (
          <Play size={22} weight="fill" />
        ) : (
          <Pause size={22} weight="fill" />
        )}
      </ControlButton>
      <button
        type="button"
        onClick={onEnd}
        aria-label="End call"
        className="flex size-14 items-center justify-center rounded-full bg-[#e4573d] text-white shadow-[0_12px_28px_-14px_rgba(228,87,61,0.8)] transition hover:bg-[#d44930]"
      >
        <PhoneDisconnect size={22} weight="fill" />
      </button>
    </div>
  );
}

function ControlButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex size-14 flex-col items-center justify-center rounded-full border transition",
        active
          ? "border-[rgba(23,23,25,0.18)] bg-[var(--pr-dark)] text-[var(--pr-cream)]"
          : "border-[var(--pr-line)] bg-white text-[var(--pr-ink)] hover:border-[rgba(23,23,25,0.16)]",
      )}
    >
      {children}
    </button>
  );
}

export function ScreenSharePrompt({
  reason,
  whatToShow,
  onAccept,
  onDecline,
  pending,
}: {
  reason: string;
  whatToShow?: string;
  onAccept: () => void;
  onDecline: () => void;
  pending: boolean;
}) {
  return (
    <div className="pr-stage pr-card w-full max-w-xl p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="pr-label">Pacific asked to watch</p>
          <p className="pr-body text-[14.5px] leading-6 text-[var(--pr-ink)]">
            {reason}
          </p>
          {whatToShow ? (
            <p className="pr-body text-[13px] leading-5 text-[var(--pr-muted)]">
              Show: {whatToShow}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onDecline}
            className="pr-body rounded-full px-3.5 py-2 text-[13px] text-[var(--pr-muted)] transition-colors hover:bg-black/[0.04] hover:text-[var(--pr-ink)]"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={pending}
            className="pr-pill !bg-[var(--pr-dark)] !text-[var(--pr-cream)] hover:!bg-[#1d1d20] disabled:opacity-60"
          >
            {pending ? "Choosing window" : "Share screen"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SharePreview({
  videoRef,
  paused,
  framesSent,
  onStop,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  paused: boolean;
  framesSent: number;
  onStop: () => void;
}) {
  return (
    <div className="pr-stage pr-card w-full max-w-sm overflow-hidden">
      <div className="relative aspect-video w-full bg-[#0d0d0f]">
        <video
          ref={videoRef}
          className={cn(
            "size-full object-contain transition-opacity",
            paused && "opacity-30",
          )}
          muted
          playsInline
          autoPlay
        />
        <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 backdrop-blur-sm">
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              paused ? "bg-white/40" : "animate-pulse bg-[#e4674f]",
            )}
          />
          <span className="pr-body text-[10.5px] tracking-[0.04em] text-white/85 uppercase">
            {paused ? "Paused" : "Pacific is watching"}
          </span>
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="pr-body text-[12px] text-[var(--pr-muted)]">
          {framesSent > 0
            ? `${framesSent} ${framesSent === 1 ? "frame" : "frames"} shared`
            : "Starting to watch"}
        </p>
        <button
          type="button"
          onClick={onStop}
          className="pr-body rounded-full px-3 py-1.5 text-[12.5px] text-[var(--pr-soft)] transition-colors hover:bg-black/[0.04] hover:text-[var(--pr-ink)]"
        >
          Stop sharing
        </button>
      </div>
    </div>
  );
}

export function StopShareHint({
  message,
  onStop,
}: {
  message: string;
  onStop: () => void;
}) {
  return (
    <div className="pr-stage pr-card flex w-full max-w-xl items-center justify-between gap-4 p-4">
      <p className="pr-body text-[13.5px] leading-6 text-[var(--pr-soft)]">
        {message}
      </p>
      <button
        type="button"
        onClick={onStop}
        className="pr-pill shrink-0 !bg-[var(--pr-dark)] !text-[var(--pr-cream)] hover:!bg-[#1d1d20]"
      >
        Stop sharing
      </button>
    </div>
  );
}

export function LiveWorkflowPanel({
  diagram,
  onConfirm,
  onNeedsFix,
}: {
  diagram: LiveWorkflowDiagram;
  onConfirm: () => void;
  onNeedsFix: () => void;
}) {
  const awaiting =
    diagram.confirmation === "pending" && Boolean(diagram.confirmPrompt);

  return (
    <div className="pr-stage w-full max-w-4xl space-y-5">
      <WorkflowDiagram
        key={diagram.revision}
        diagram={{ nodes: diagram.nodes, edges: diagram.edges }}
        variant="wonderful"
        emptyMessage="Drawing your workflow…"
        animate
        compact
      />

      {awaiting ? (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={onNeedsFix}
            className="pr-body rounded-full px-3.5 py-2 text-[13px] text-[var(--pr-muted)] transition-colors hover:bg-black/[0.04] hover:text-[var(--pr-ink)]"
          >
            Needs a fix
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="pr-pill !bg-[var(--pr-dark)] !text-[var(--pr-cream)] hover:!bg-[#1d1d20]"
          >
            Looks right
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AutomationProposalCard({
  proposal,
  onConfirm,
  onReject,
}: {
  proposal: AutomationProposal;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const agentPreview = proposal.agentSteps.slice(0, 3);
  const humanPreview = proposal.humanSteps.slice(0, 2);

  return (
    <div className="pr-stage w-full max-w-lg space-y-6 text-center">
      <div className="space-y-3">
        <p className="pr-label">Your agent</p>
        <h3 className="pr-display text-[1.75rem] leading-[1.1] text-[var(--pr-ink)] md:text-[2rem]">
          {proposal.name}
        </h3>
        <p className="pr-body mx-auto max-w-md text-[15px] leading-7 text-[var(--pr-soft)]">
          {proposal.outcome}
        </p>
      </div>

      <div className="space-y-3 text-left">
        <PlanRow label="Starts when" value={proposal.trigger} />
        {agentPreview.map((step, index) => (
          <PlanRow
            key={`agent-${index}`}
            label={index === 0 ? "Then it" : undefined}
            value={step}
            tone="agent"
          />
        ))}
        {humanPreview.map((step, index) => (
          <PlanRow
            key={`human-${index}`}
            label={index === 0 ? "You still" : undefined}
            value={step}
            tone="human"
          />
        ))}
      </div>

      {proposal.status === "proposed" ? (
        <div className="flex items-center justify-center gap-2 pt-1">
          <button
            type="button"
            onClick={onReject}
            className="pr-body rounded-full px-3.5 py-2 text-[13px] text-[var(--pr-muted)] transition-colors hover:bg-black/[0.04] hover:text-[var(--pr-ink)]"
          >
            Not this one
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="pr-pill !bg-[var(--pr-dark)] !text-[var(--pr-cream)] hover:!bg-[#1d1d20]"
          >
            Yes, prepare this
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function IntegrationConnectPanel({
  integrations,
  onConnect,
}: {
  integrations: IntegrationRequirement[];
  onConnect: (id: string) => void;
}) {
  if (integrations.length === 0) return null;

  return (
    <div className="pr-stage w-full max-w-md space-y-6 text-center">
      <div className="space-y-2">
        <p className="pr-label">Connect apps</p>
        <h3 className="pr-display text-[1.6rem] text-[var(--pr-ink)]">
          A few apps to link
        </h3>
        <p className="pr-body text-[14px] leading-6 text-[var(--pr-muted)]">
          Tap to connect. This is a preview for now.
        </p>
      </div>

      <ul className="space-y-3 text-left">
        {integrations.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--pr-line)] px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <AppLogo name={item.app} size={28} />
              <div className="min-w-0">
                <p className="pr-body text-[15px] text-[var(--pr-ink)]">
                  {item.app}
                </p>
                {item.connected ? (
                  <p className="pr-body text-[12px] text-emerald-700">Connected</p>
                ) : item.required ? (
                  <p className="pr-body text-[12px] text-[var(--pr-muted)]">
                    Needed
                  </p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              disabled={item.connected}
              onClick={() => onConnect(item.id)}
              className={cn(
                "pr-pill shrink-0 !px-3.5 !py-2 !text-[12.5px]",
                item.connected
                  ? "!bg-black/[0.04] !text-[var(--pr-muted)]"
                  : "!bg-[var(--pr-dark)] !text-[var(--pr-cream)] hover:!bg-[#1d1d20]",
              )}
            >
              {item.connected ? "Done" : "Connect"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AgentReadinessCard({ readiness }: { readiness: AgentReadiness }) {
  const leftovers = readiness.remainingSetup.slice(0, 3);
  const apps = readiness.requiredIntegrations.slice(0, 4);

  return (
    <div className="pr-stage w-full max-w-xl space-y-6 text-center">
      <div className="space-y-3">
        <StatusChip
          label={readiness.readyToCreate ? "Ready" : "Almost there"}
          tone={readiness.readyToCreate ? "good" : "warn"}
        />
        <h3 className="pr-display text-[1.75rem] leading-[1.1] text-[var(--pr-ink)] md:text-[2.1rem]">
          {readiness.agentName}
        </h3>
        <p className="pr-body mx-auto max-w-md text-[15px] leading-7 text-[var(--pr-soft)]">
          {readiness.outcome}
        </p>
      </div>

      {readiness.proposedAgentDiagram ? (
        <WorkflowDiagram
          agentDiagram={readiness.proposedAgentDiagram}
          variant="wonderful"
          animate
          compact
        />
      ) : (
        <div className="space-y-3 text-left">
          <PlanRow label="Starts when" value={readiness.trigger} />
        </div>
      )}

      {apps.length ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {apps.map((app) => (
            <span
              key={app}
              className="pr-body inline-flex items-center gap-2 rounded-full border border-[var(--pr-line)] px-3 py-1.5 text-[12.5px] text-[var(--pr-soft)]"
            >
              <AppLogo name={app} size={14} />
              {app}
            </span>
          ))}
        </div>
      ) : null}

      {readiness.readyToCreate ? (
        <p className="pr-body text-[13px] leading-6 text-[var(--pr-muted)]">
          Ready to create. Nothing has been deployed yet.
        </p>
      ) : leftovers.length ? (
        <div className="mx-auto max-w-sm space-y-2 text-left">
          <p className="pr-label text-center">Still needed</p>
          {leftovers.map((item) => (
            <div
              key={item}
              className="pr-body flex gap-2 text-[13.5px] leading-6 text-[var(--pr-soft)]"
            >
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-[rgba(23,23,25,0.35)]" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="pr-body text-[13px] leading-6 text-[var(--pr-muted)]">
          {readiness.statusNote}
        </p>
      )}
    </div>
  );
}

function PlanRow({
  label,
  value,
  tone = "default",
}: {
  label?: string;
  value: string;
  tone?: "default" | "agent" | "human";
}) {
  return (
    <div className="flex gap-3 rounded-2xl border border-[var(--pr-line)] px-4 py-3">
      <span
        aria-hidden
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          tone === "agent" && "bg-[#111113]",
          tone === "human" && "bg-sky-400",
          tone === "default" && "bg-black/25",
        )}
      />
      <div className="min-w-0 space-y-0.5">
        {label ? <p className="pr-label !text-[10px]">{label}</p> : null}
        <p className="pr-body text-[14px] leading-6 text-[var(--pr-ink)]">
          {value}
        </p>
      </div>
    </div>
  );
}

/**
 * Full-height transcript rail on the right, so the call stays centered.
 */
export function TranscriptPanel({
  transcript,
  open,
  onToggle,
}: {
  transcript: TranscriptLine[];
  open: boolean;
  onToggle: () => void;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcript, open]);

  const spoken = transcript.filter((line) => line.role !== "system");

  return (
    <aside
      className={cn(
        "fixed top-0 right-0 z-20 flex h-dvh flex-col border-l border-[var(--pr-line)] bg-white transition-[width,transform] duration-300 ease-out",
        open ? "w-[min(22rem,92vw)]" : "w-12",
      )}
      aria-label="Call transcript"
    >
      <div
        className={cn(
          "flex items-center border-b border-[var(--pr-line)] px-3 py-4",
          open ? "justify-between" : "justify-center",
        )}
      >
        {open ? <p className="pr-label">Transcript</p> : null}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? "Hide transcript" : "Show transcript"}
          className="flex size-8 items-center justify-center rounded-full text-[var(--pr-muted)] transition-colors hover:bg-black/[0.04] hover:text-[var(--pr-ink)]"
        >
          {open ? (
            <CaretRight size={16} weight="bold" />
          ) : (
            <CaretLeft size={16} weight="bold" />
          )}
        </button>
      </div>

      {open ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {spoken.length === 0 ? (
            <p className="pr-body text-[13px] leading-6 text-[var(--pr-muted)]">
              The transcript will fill in as you talk.
            </p>
          ) : (
            <div className="space-y-5">
              {spoken.map((line) => (
                <div key={line.id} className="space-y-1">
                  <p className="pr-label !text-[10px]">
                    {line.role === "user" ? "You" : "Pacific"}
                  </p>
                  <p className="pr-body text-[13px] leading-6 text-[var(--pr-soft)]">
                    {line.text}
                  </p>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          className="pr-body flex flex-1 items-center justify-center px-2 text-[11px] tracking-[0.14em] text-[var(--pr-muted)] uppercase [writing-mode:vertical-rl]"
        >
          Transcript
        </button>
      )}
    </aside>
  );
}

function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: "good" | "warn" | "neutral";
}) {
  return (
    <span
      className={cn(
        "pr-body inline-flex rounded-full px-2.5 py-1 text-[11px] tracking-[0.04em] uppercase",
        tone === "good" && "bg-emerald-500/10 text-emerald-800",
        tone === "warn" && "bg-amber-500/10 text-amber-800",
        tone === "neutral" && "bg-black/[0.04] text-[var(--pr-muted)]",
      )}
    >
      {label}
    </span>
  );
}

