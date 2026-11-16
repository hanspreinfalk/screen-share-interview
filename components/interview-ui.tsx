"use client";

import { useEffect, useRef } from "react";

import { AppLogo } from "@/components/app-logo";
import { formatClock, SESSION_LIMIT_SECONDS } from "@/lib/use-session-clock";
import { cn } from "@/lib/utils";
import type { TranscriptLine } from "@/lib/session-types";

export type VoiceState = "connecting" | "listening" | "speaking" | "muted" | "idle";

/**
 * The primary focus of the live screen: shows whether Pacific is listening,
 * speaking, or connecting.
 */
export function VoiceOrb({ state }: { state: VoiceState }) {
  const speaking = state === "speaking";
  const listening = state === "listening";
  const connecting = state === "connecting";
  const muted = state === "muted";

  return (
    <div className="relative flex size-[132px] items-center justify-center">
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 rounded-full",
          speaking
            ? "pr-orb-halo-active bg-[radial-gradient(circle,rgba(17,17,19,0.16),transparent_70%)]"
            : listening
              ? "pr-orb-halo bg-[radial-gradient(circle,rgba(17,17,19,0.1),transparent_70%)]"
              : "bg-[radial-gradient(circle,rgba(17,17,19,0.05),transparent_70%)]",
        )}
      />
      <span
        aria-hidden
        className={cn(
          "absolute rounded-full border transition-all duration-700",
          speaking
            ? "size-[104px] border-[rgba(17,17,19,0.16)]"
            : "size-[92px] border-[rgba(17,17,19,0.09)]",
        )}
      />
      <div
        className={cn(
          "relative flex size-[68px] items-center justify-center rounded-full transition-transform duration-500",
          "bg-[var(--pr-dark)] shadow-[0_18px_40px_-20px_rgba(17,17,19,0.6)]",
          speaking && "scale-[1.06]",
          muted && "opacity-45",
        )}
      >
        {speaking ? (
          <span aria-hidden className="flex items-end gap-[3px]">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="pr-eq-bar w-[3px] origin-bottom rounded-full bg-[var(--pr-cream)]"
                style={{ height: 18, animationDelay: `${i * 150}ms` }}
              />
            ))}
          </span>
        ) : connecting ? (
          <span
            aria-hidden
            className="size-4 animate-spin rounded-full border-2 border-white/25 border-t-white/90"
          />
        ) : muted ? (
          <MicOffGlyph />
        ) : (
          <span aria-hidden className="size-2.5 rounded-full bg-[var(--pr-cream)]" />
        )}
      </div>
    </div>
  );
}

function MicOffGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="var(--pr-cream)"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Z" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

/**
 * Subtle countdown. A thin ring drains over the 5 minutes and the label turns
 * amber in the final minute, so time pressure is felt without a loud timer.
 */
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

/**
 * Contextual Share Screen call to action, raised by Pacific's
 * request_screen_share action. Declining is a first-class choice.
 */
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
    <div className="pr-rise pr-card w-full max-w-xl p-5">
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

/** Compact live preview, rendered only while sharing is active. */
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
    <div className="pr-rise pr-card w-full max-w-sm overflow-hidden">
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

/**
 * Secondary transcript. Collapsed by default so the conversation stays the
 * focus, but always reachable and announced to screen readers.
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
    <div className="w-full max-w-xl">
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="pr-body inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] text-[var(--pr-muted)] transition-colors hover:text-[var(--pr-ink)]"
        >
          {open ? "Hide transcript" : "Show transcript"}
          <svg
            viewBox="0 0 24 24"
            className={cn(
              "size-3.5 transition-transform",
              open && "rotate-180",
            )}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {open ? (
        <div className="pr-card mt-3 max-h-64 overflow-y-auto px-5 py-4">
          {spoken.length === 0 ? (
            <p className="pr-body text-[13.5px] leading-6 text-[var(--pr-muted)]">
              The transcript will fill in as you talk.
            </p>
          ) : (
            <div className="space-y-4">
              {spoken.map((line) => (
                <div key={line.id} className="space-y-1">
                  <p className="pr-label !text-[10px]">
                    {line.role === "user" ? "You" : "Pacific"}
                  </p>
                  <p className="pr-body text-[13.5px] leading-6 text-[var(--pr-soft)]">
                    {line.text}
                  </p>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Small row of logos for applications Pacific has picked up so far. */
export function CapturedApps({ applications }: { applications: string[] }) {
  if (applications.length === 0) return null;
  const shown = applications.slice(0, 6);
  const extra = applications.length - shown.length;

  return (
    <div className="pr-fade-in flex flex-wrap items-center justify-center gap-2">
      <span className="pr-label !text-[10px]">Noted</span>
      {shown.map((app) => (
        <span
          key={app}
          className="pr-chip !gap-1.5 !px-2.5 !py-1 !text-[11.5px]"
        >
          <AppLogo name={app} size={12} />
          {app}
        </span>
      ))}
      {extra > 0 ? (
        <span className="pr-body text-[11.5px] text-[var(--pr-muted)]">
          +{extra} more
        </span>
      ) : null}
    </div>
  );
}
