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

import Link from "next/link";

import { AppLogo } from "@/components/app-logo";
import { StatusPill } from "@/components/pacific/primitives";
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
        "pr-wave relative flex h-[88px] w-[180px] items-center justify-center gap-[4px]",
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

export function CallStatusLabel({
  state,
  wrappingUp = false,
}: {
  state: VoiceState;
  wrappingUp?: boolean;
}) {
  const label =
    state === "connecting"
      ? "Connecting"
      : state === "speaking"
        ? "Speaking"
        : state === "thinking"
          ? "Thinking"
          : state === "paused"
            ? "Paused"
            : state === "muted"
              ? "Muted"
              : state === "listening"
                ? "Listening"
                : "Ready";

  return (
    <p
      className={cn(
        "pr-body text-[13px] tracking-[0.02em] text-[var(--pr-muted)]",
        wrappingUp && "text-[var(--pr-warn)]",
      )}
      aria-live="polite"
    >
      {wrappingUp ? `${label} · wrapping up` : label}
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
          stroke={isFinalMinute ? "var(--pr-warn)" : "rgba(23,23,25,0.55)"}
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
          isFinalMinute ? "text-[var(--pr-warn)]" : "text-[var(--pr-muted)]",
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
            className="pr-pill !bg-[var(--pr-dark)] !text-[var(--pr-cream)] hover:!bg-[var(--pr-dark-hover)] disabled:opacity-60"
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
        className="pr-pill shrink-0 !bg-[var(--pr-dark)] !text-[var(--pr-cream)] hover:!bg-[var(--pr-dark-hover)]"
      >
        Stop sharing
      </button>
    </div>
  );
}

function SimpleWorkflowFlow({
  nodes,
}: {
  nodes: LiveWorkflowDiagram["nodes"];
}) {
  if (!nodes.length) {
    return (
      <div className="flex min-h-[140px] items-center justify-center px-4 text-center">
        <p className="pr-body text-[13.5px] text-[var(--pr-muted)]">
          Drawing your workflow…
        </p>
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-2 px-4 py-4 sm:px-5">
      {nodes.map((node, index) => (
        <li
          key={`${node.id}-${index}`}
          className="flex items-center gap-3 rounded-2xl border border-[var(--pr-line)] bg-white px-3 py-2.5"
        >
          <span className="pr-display flex size-6 shrink-0 items-center justify-center text-[13px] text-[var(--pr-ink)]/30">
            {index + 1}
          </span>
          {node.application ? <AppLogo name={node.application} size={16} /> : null}
          <p className="pr-body min-w-0 flex-1 truncate text-[13.5px] text-[var(--pr-ink)]">
            {node.label}
          </p>
        </li>
      ))}
    </ol>
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
    <div className="w-full max-w-md space-y-4">
      <p className="pr-label text-center">
        {diagram.title || "Workflow"}
      </p>

      <div className="overflow-hidden rounded-[1.25rem] border border-[var(--pr-line)] bg-[#fafaf8]">
        <SimpleWorkflowFlow nodes={diagram.nodes} />
      </div>

      {awaiting ? (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={onNeedsFix}
            className="pr-body cursor-pointer rounded-full px-3.5 py-2 text-[13px] text-[var(--pr-muted)] transition-colors hover:bg-black/[0.04] hover:text-[var(--pr-ink)]"
          >
            Fix
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="pr-pill cursor-pointer !bg-[var(--pr-dark)] !text-[var(--pr-cream)] hover:!bg-[var(--pr-dark-hover)]"
          >
            Looks right
          </button>
        </div>
      ) : null}
    </div>
  );
}

function shorten(text: string, max = 72) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trim()}…`;
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
  const steps = proposal.agentSteps.slice(0, 4);

  return (
    <div className="w-full max-w-sm space-y-4 text-center">
      <div className="space-y-1.5">
        <p className="pr-label">Automation</p>
        <h3 className="pr-display text-[1.5rem] leading-[1.1] text-[var(--pr-ink)]">
          {proposal.name}
        </h3>
      </div>

      {steps.length ? (
        <ol className="space-y-1.5 text-left">
          {steps.map((step, index) => (
            <li
              key={`${step}-${index}`}
              className="flex items-center gap-2.5 rounded-full border border-[var(--pr-line)] bg-white px-3 py-2"
            >
              <span className="pr-display flex size-5 shrink-0 items-center justify-center text-[12px] text-[var(--pr-ink)]/35">
                {index + 1}
              </span>
              <span className="pr-body truncate text-[13px] text-[var(--pr-ink)]">
                {shorten(step, 48)}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {proposal.status === "proposed" ? (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={onReject}
            className="pr-body cursor-pointer rounded-full px-3.5 py-2 text-[13px] text-[var(--pr-muted)] transition-colors hover:bg-black/[0.04] hover:text-[var(--pr-ink)]"
          >
            Not this
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="pr-pill cursor-pointer !bg-[var(--pr-dark)] !text-[var(--pr-cream)] hover:!bg-[var(--pr-dark-hover)]"
          >
            Build this
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function IntegrationConnectPanel({
  integrations,
  onConnect,
  connectingId,
}: {
  integrations: IntegrationRequirement[];
  onConnect: (id: string) => void;
  connectingId?: string | null;
}) {
  if (integrations.length === 0) return null;

  return (
    <div className="w-full max-w-sm space-y-5 text-center">
      <p className="pr-label">Connect</p>

      <ul className="space-y-2.5 text-left">
        {integrations.map((item) => {
          const busy = connectingId === item.id;
          return (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--pr-line)] px-3.5 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <AppLogo name={item.app} size={28} />
                <p className="pr-body truncate text-[14px] text-[var(--pr-ink)]">
                  {item.app}
                </p>
              </div>
              <button
                type="button"
                disabled={item.connected || busy}
                onClick={() => onConnect(item.id)}
                className={cn(
                  "pr-pill shrink-0 cursor-pointer !px-3.5 !py-2 !text-[12.5px]",
                  item.connected
                    ? "!bg-emerald-50 !text-emerald-700"
                    : "!bg-[var(--pr-dark)] !text-[var(--pr-cream)] hover:!bg-[var(--pr-dark-hover)]",
                )}
              >
                {item.connected ? "Connected" : busy ? "…" : "Connect"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AgentReadinessCard({
  readiness,
  onCreate,
  onCreateAndTest,
  creating,
}: {
  readiness: AgentReadiness;
  onCreate?: () => void;
  onCreateAndTest?: () => void;
  creating?: boolean;
}) {
  const leftovers = readiness.remainingSetup.slice(0, 2);
  const apps = readiness.requiredIntegrations.slice(0, 4);
  const created = Boolean(readiness.automationId);
  const test = readiness.testStatus ?? null;

  // The card must never imply success before a run has actually been verified.
  const state: { label: string; tone: "good" | "warn" | "danger" | "neutral" } =
    test === "passed"
      ? { label: "Works", tone: "good" }
      : test === "running"
        ? { label: "Testing", tone: "neutral" }
        : test === "failed"
          ? { label: "Test failed", tone: "danger" }
          : test === "unverified"
            ? { label: "Unverified", tone: "warn" }
            : test === "awaiting_approval"
              ? { label: "Needs approval", tone: "warn" }
              : created
                ? { label: "Created", tone: "neutral" }
                : readiness.readyToCreate
                  ? { label: "Ready to build", tone: "good" }
                  : { label: "Almost", tone: "warn" };

  return (
    <div className="w-full max-w-sm space-y-4 text-center">
      <div className="space-y-2.5">
        <StatusPill label={state.label} tone={state.tone} />
        <h3 className="pr-display text-[1.5rem] leading-[1.12] text-[var(--pr-ink)]">
          {readiness.agentName}
        </h3>
      </div>

      {apps.length ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {apps.map((app) => (
            <span
              key={app}
              className="inline-flex size-9 items-center justify-center rounded-full border border-[var(--pr-line)] bg-white"
              title={app}
            >
              <AppLogo name={app} size={16} />
            </span>
          ))}
        </div>
      ) : null}

      {test ? (
        <div className="space-y-2">
          {test === "running" ? (
            <div className="flex items-center justify-center gap-2 text-[12.5px] text-[var(--pr-muted)]">
              <span className="size-1.5 animate-pulse rounded-full bg-[var(--pr-ink)]/40" />
              Running a real test
            </div>
          ) : readiness.testSummary ? (
            <p
              className={cn(
                "mx-auto max-w-[17rem] text-[12.5px] leading-5",
                test === "failed"
                  ? "text-[var(--pr-danger)]"
                  : test === "passed"
                    ? "text-[var(--pr-soft)]"
                    : "text-[var(--pr-warn)]",
              )}
            >
              {readiness.testSummary}
            </p>
          ) : null}
          {created && test !== "running" ? (
            <Link
              href={`/automations/${readiness.automationId}`}
              className="inline-block text-[12px] text-[var(--pr-muted)] underline-offset-2 hover:text-[var(--pr-ink)] hover:underline"
            >
              Open in Automations
            </Link>
          ) : null}
        </div>
      ) : created ? (
        <Link
          href={`/automations/${readiness.automationId}`}
          className="inline-block text-[12px] text-[var(--pr-muted)] underline-offset-2 hover:text-[var(--pr-ink)] hover:underline"
        >
          Open in Automations
        </Link>
      ) : readiness.readyToCreate && onCreate ? (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            disabled={creating}
            onClick={onCreateAndTest ?? onCreate}
            className="pr-pill !bg-[var(--pr-dark)] !px-6 !py-3 !text-[13px] !text-[var(--pr-cream)] hover:!bg-[var(--pr-dark-hover)] disabled:opacity-60"
          >
            {creating ? "Building" : "Build and test"}
          </button>
          {onCreateAndTest ? (
            <button
              type="button"
              disabled={creating}
              onClick={onCreate}
              className="text-[12px] text-[var(--pr-muted)] hover:text-[var(--pr-ink)]"
            >
              Build without testing
            </button>
          ) : null}
        </div>
      ) : leftovers.length ? (
        <div className="flex flex-wrap justify-center gap-1.5">
          {leftovers.map((item) => (
            <span
              key={item}
              className="max-w-[14rem] truncate rounded-full border border-[var(--pr-line)] px-2.5 py-1 text-[11.5px] text-[var(--pr-soft)]"
              title={item}
            >
              {shorten(item, 28)}
            </span>
          ))}
        </div>
      ) : null}
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
        "fixed top-0 right-0 z-20 flex h-dvh flex-col border-l border-[var(--pr-line)] bg-white/95 backdrop-blur-sm transition-[width] duration-300 ease-out",
        open ? "w-[min(18rem,88vw)]" : "w-11",
      )}
      aria-label="Call transcript"
    >
      <div
        className={cn(
          "flex items-center border-b border-[var(--pr-line)] px-2.5 py-3",
          open ? "justify-between px-3" : "justify-center",
        )}
      >
        {open ? <p className="pr-label !text-[10px]">Talk</p> : null}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? "Hide transcript" : "Show transcript"}
          className="flex size-8 cursor-pointer items-center justify-center rounded-full text-[var(--pr-muted)] transition-colors hover:bg-black/[0.04] hover:text-[var(--pr-ink)]"
        >
          {open ? (
            <CaretRight size={16} weight="bold" />
          ) : (
            <CaretLeft size={16} weight="bold" />
          )}
        </button>
      </div>

      {open ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {spoken.length === 0 ? (
            <p className="pr-body text-[12px] text-[var(--pr-muted)]">Empty</p>
          ) : (
            <div className="space-y-3">
              {spoken.map((line) => (
                <div key={line.id} className="space-y-0.5">
                  <p className="pr-label !text-[9px] !tracking-[0.14em]">
                    {line.role === "user" ? "You" : "Pacific"}
                  </p>
                  <p className="line-clamp-4 text-[12.5px] leading-5 text-[var(--pr-soft)]">
                    {line.text}
                  </p>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>
      ) : null}
    </aside>
  );
}


