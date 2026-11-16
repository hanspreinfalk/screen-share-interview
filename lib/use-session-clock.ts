"use client";

import { useEffect, useRef, useState } from "react";

import type { RealtimeVoiceSession } from "@/lib/realtime-session";

/** Hard ceiling for every interview. Never extended. */
export const SESSION_LIMIT_SECONDS = 300;

/**
 * Seconds-remaining marks where Pacific gets a private pacing note so it can
 * steer the conversation and warn the user in its own words.
 */
const PACING_MARKS: Array<{ at: number; note: string }> = [
  {
    at: 180,
    note: "[Time check: 3 minutes left. Make sure you understand the core workflow steps and the applications involved.]",
  },
  {
    at: 120,
    note: "[Time check: 2 minutes left. Start covering what goes wrong and how they know the work succeeded.]",
  },
  {
    at: 60,
    note: "[Time check: 1 minute left. Tell the user there is about a minute left, then ask the single most valuable remaining question.]",
  },
  {
    at: 25,
    note: "[Time check: 25 seconds left. Wrap up now. Thank them briefly. If readiness is not shown yet, call show_agent_readiness with an honest status. Do not start a new topic.]",
  },
];

export type SessionClock = {
  /** Whole seconds remaining, floored at 0. */
  remaining: number;
  elapsed: number;
  /** True once under 60s, used to tint the countdown. */
  isFinalMinute: boolean;
};

function remainingFrom(startedAt: number | null, now: number | null) {
  if (startedAt === null || now === null) return SESSION_LIMIT_SECONDS;
  const deadline = startedAt + SESSION_LIMIT_SECONDS * 1000;
  // Clamped so a `now` reading from before the session started (the render
  // between connecting and the first tick) cannot show more than the limit.
  return Math.min(
    SESSION_LIMIT_SECONDS,
    Math.max(0, Math.ceil((deadline - now) / 1000)),
  );
}

/**
 * Drives the 5 minute interview clock.
 *
 * Remaining time is derived from the `startedAt` wall-clock timestamp rather
 * than accumulated ticks, so a throttled background tab cannot buy the session
 * extra time. `onExpire` fires exactly once per session.
 */
export function useSessionClock({
  startedAt,
  sessionRef,
  onExpire,
}: {
  /** Timestamp the session connected, or null when not running. */
  startedAt: number | null;
  sessionRef: React.RefObject<RealtimeVoiceSession | null>;
  onExpire: () => void;
}): SessionClock {
  // Null until the first interval tick. Reading the clock during render would
  // be an unstable value during prerender.
  const [now, setNow] = useState<number | null>(null);

  // Pacing marks and the expiry guard are scoped to one session.
  const marksRef = useRef<{ key: number | null; fired: Set<number> }>({
    key: null,
    fired: new Set(),
  });
  const expiredRef = useRef<number | null>(null);

  // Keep the latest callback without restarting the interval.
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (startedAt === null) return;

    const tick = () => {
      const stamp = Date.now();
      setNow(stamp);
      const left = remainingFrom(startedAt, stamp);

      if (marksRef.current.key !== startedAt) {
        marksRef.current = { key: startedAt, fired: new Set() };
      }
      for (const mark of PACING_MARKS) {
        if (left <= mark.at && !marksRef.current.fired.has(mark.at)) {
          marksRef.current.fired.add(mark.at);
          // Nudge a response only for the spoken warnings, so the earlier
          // notes do not interrupt the user mid-sentence.
          sessionRef.current?.notifyModel(mark.note, {
            triggerResponse: mark.at <= 60,
          });
        }
      }

      if (left <= 0 && expiredRef.current !== startedAt) {
        expiredRef.current = startedAt;
        onExpireRef.current();
      }
    };

    // No immediate tick: the first interval lands in 500ms, and `remaining`
    // is already clamped to the limit until then.
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [startedAt, sessionRef]);
  const remaining = remainingFrom(startedAt, now);

  return {
    remaining,
    elapsed: SESSION_LIMIT_SECONDS - remaining,
    isFinalMinute: remaining <= 60,
  };
}

export function formatClock(seconds: number) {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
