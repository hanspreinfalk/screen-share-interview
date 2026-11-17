"use client";

import { Show, SignInButton, useAuth, useClerk, useUser } from "@clerk/nextjs";
import {
  Microphone,
  MicrophoneSlash,
  Phone,
  Star,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FriendVoiceSession } from "@/lib/friend-session";
import type { RealtimeStatus } from "@/lib/session-types";
import { useVoiceLevels } from "@/lib/use-voice-levels";
import { cn } from "@/lib/utils";

type Phase = "idle" | "live" | "ended";

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function greetingForHour(hour: number) {
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

/**
 * Sesame-matched friend call UI.
 * Idle: greeting + single Pacific call card.
 * Live: name, timer, dark orb, Mute / End call.
 * Ended: thank-you + star rating + continue.
 */
export function FriendCall() {
  const { isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();
  const sessionRef = useRef<FriendVoiceSession | null>(null);
  const endingRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [rating, setRating] = useState<number | null>(null);
  const [greeting, setGreeting] = useState("Hello");

  const firstName = user?.firstName?.trim() || null;

  const live = phase === "live";
  const levels = useVoiceLevels({
    micStream,
    remoteStream,
    enabled: live,
    muted: micMuted,
  });

  useEffect(() => {
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

  useEffect(() => {
    if (!live || !startedAt) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [live, startedAt]);

  const endCall = useCallback(() => {
    if (endingRef.current) return;
    endingRef.current = true;
    sessionRef.current?.stop();
    sessionRef.current = null;
    setMicStream(null);
    setRemoteStream(null);
    setStatus("idle");
    setMicMuted(false);
    setStartedAt(null);
    setRating(null);
    setPhase("ended");
    endingRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, []);

  async function startCall() {
    if (!isSignedIn) return;
    setError(null);
    setPhase("live");
    setStatus("connecting");
    setStartedAt(Date.now());
    setNow(Date.now());
    endingRef.current = false;

    const session = new FriendVoiceSession({
      onStatus: setStatus,
      onError: (message) => setError(message),
      onRemoteStream: setRemoteStream,
    });
    sessionRef.current = session;

    try {
      await session.start({ firstName });
      setMicStream(session.getMicStream());
      setRemoteStream(session.getRemoteStream());
    } catch (err) {
      session.stop();
      sessionRef.current = null;
      setMicStream(null);
      setRemoteStream(null);
      setStatus("idle");
      setStartedAt(null);
      setPhase("idle");
      setError(err instanceof Error ? err.message : "Could not start the call");
    }
  }

  function continueAfterCall() {
    setRating(null);
    setError(null);
    setPhase("idle");
  }

  const elapsed = startedAt ? now - startedAt : 0;
  const speaking = status === "speaking";
  const thinking = status === "thinking";
  const connecting = status === "connecting";

  const greetingLine = useMemo(() => {
    if (firstName) return `${greeting}, ${firstName}`;
    return greeting;
  }, [firstName, greeting]);

  return (
    <div className="friend-surface flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between px-5 pt-4 pb-3 max-md:landscape:px-4 max-md:landscape:pt-2 max-md:landscape:pb-1 md:px-6">
        <p className="friend-brand text-[17px] font-bold tracking-[0.08em] text-black uppercase max-md:landscape:text-[14px] md:text-[18px]">
          Pacific Machines
        </p>
        <AccountLink />
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto overscroll-contain px-6 max-md:landscape:px-4">
        {phase === "idle" ? (
          <IdleLobby
            greeting={greetingLine}
            isLoaded={isLoaded}
            isSignedIn={Boolean(isSignedIn)}
            error={error}
            onStart={() => void startCall()}
          />
        ) : null}

        {phase === "live" ? (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-[min(18vh,8.5rem)] z-10 flex flex-col items-center max-md:landscape:top-2">
              <h1 className="friend-name text-[1.65rem] leading-none text-black max-md:landscape:text-[1.25rem] md:text-[1.85rem]">
                Pacific
              </h1>
              <p
                className="friend-sans mt-3 text-[13px] tracking-[0.02em] text-black/40 tabular-nums max-md:landscape:mt-1 max-md:landscape:text-[12px]"
                aria-live="off"
                role="timer"
              >
                {connecting ? "00:00" : formatElapsed(elapsed)}
              </p>
            </div>

            <div className="absolute inset-0 flex items-center justify-center pb-8 max-md:landscape:pb-0 max-md:landscape:pt-6">
              <Presence
                live
                speaking={speaking}
                thinking={thinking}
                connecting={connecting}
                levels={levels}
              />
            </div>

            {error ? (
              <p
                role="alert"
                className="friend-sans absolute inset-x-0 bottom-44 z-10 mx-auto max-w-xs text-center text-[13px] leading-5 text-[#9a4a3a] max-md:landscape:bottom-16 md:bottom-48"
              >
                {error}
              </p>
            ) : null}

            <div className="absolute inset-x-0 bottom-28 z-10 flex flex-col items-center gap-3 max-md:landscape:bottom-3 md:bottom-32">
              <CallBar
                muted={micMuted}
                onToggleMute={() => {
                  const next = !micMuted;
                  setMicMuted(next);
                  sessionRef.current?.setMicMuted(next);
                }}
                onEnd={endCall}
              />
            </div>
          </>
        ) : null}

        {phase === "ended" ? (
          <EndedFeedback
            rating={rating}
            onRate={setRating}
            onContinue={continueAfterCall}
          />
        ) : null}
      </main>
    </div>
  );
}

function IdleLobby({
  greeting,
  isLoaded,
  isSignedIn,
  error,
  onStart,
}: {
  greeting: string;
  isLoaded: boolean;
  isSignedIn: boolean;
  error: string | null;
  onStart: () => void;
}) {
  return (
    <div className="flex w-full min-h-0 flex-1 flex-col items-center justify-center px-4 pb-10 pt-4 max-md:landscape:justify-start max-md:landscape:gap-3 max-md:landscape:px-2 max-md:landscape:pb-3 max-md:landscape:pt-1">
      <h1 className="friend-name mb-8 shrink-0 text-center text-[1.55rem] leading-none text-black max-md:landscape:mb-0 max-md:landscape:text-[1.2rem] md:mb-10 md:text-[1.75rem]">
        {greeting}
      </h1>

      {!isLoaded ? (
        <div
          className="friend-picker h-[min(44vh,20rem)] w-[min(94vw,32rem)] shrink-0 animate-pulse rounded-[1.25rem] bg-black/[0.06] max-md:landscape:h-[min(52vh,9.5rem)] max-md:landscape:w-[min(72vw,28rem)]"
          aria-hidden
        />
      ) : isSignedIn ? (
        <button
          type="button"
          onClick={onStart}
          className="friend-picker group flex h-[min(44vh,20rem)] w-[min(94vw,32rem)] shrink-0 items-center justify-center gap-3 rounded-[1.25rem] bg-[#1c1816] text-white transition hover:bg-[#25201d] active:scale-[0.992] max-md:landscape:h-[min(52vh,9.5rem)] max-md:landscape:w-[min(72vw,28rem)]"
        >
          <Phone size={22} weight="fill" className="opacity-95 max-md:landscape:size-5" />
          <span className="friend-name text-[1.45rem] leading-none tracking-[-0.02em] max-md:landscape:text-[1.25rem] md:text-[1.55rem]">
            Pacific
          </span>
        </button>
      ) : (
        <SignInButton mode="redirect" forceRedirectUrl="/">
          <button
            type="button"
            className="friend-picker group flex h-[min(44vh,20rem)] w-[min(94vw,32rem)] shrink-0 items-center justify-center gap-3 rounded-[1.25rem] bg-[#1c1816] text-white transition hover:bg-[#25201d] max-md:landscape:h-[min(52vh,9.5rem)] max-md:landscape:w-[min(72vw,28rem)]"
          >
            <Phone size={22} weight="fill" className="opacity-95 max-md:landscape:size-5" />
            <span className="friend-name text-[1.45rem] leading-none tracking-[-0.02em] max-md:landscape:text-[1.25rem] md:text-[1.55rem]">
              Pacific
            </span>
          </button>
        </SignInButton>
      )}

      <p className="friend-sans mt-5 shrink-0 text-center text-[14px] leading-[1.5] text-black/55 max-md:landscape:mt-0 max-md:landscape:text-[12px] max-md:landscape:leading-[1.35]">
        By using our services, you agree to{" "}
        <span className="whitespace-nowrap">Pacific Machines&apos;</span>
        <br />
        <span className="whitespace-nowrap">
          Terms of Use and Privacy Policy.
        </span>
      </p>

      {error ? (
        <p
          role="alert"
          className="friend-sans mt-6 max-w-xs shrink-0 text-center text-[13px] leading-5 text-[#9a4a3a] max-md:landscape:mt-1"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function EndedFeedback({
  rating,
  onRate,
  onContinue,
}: {
  rating: number | null;
  onRate: (value: number) => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex w-full min-h-0 flex-1 flex-col items-center pb-10 pt-4 max-md:landscape:justify-start max-md:landscape:pb-3 max-md:landscape:pt-1">
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center max-md:landscape:justify-start max-md:landscape:gap-3">
        <h1 className="friend-name mb-8 shrink-0 text-center text-[1.45rem] leading-snug text-black max-md:landscape:mb-0 max-md:landscape:text-[1.15rem] md:mb-10 md:text-[1.65rem]">
          Thank you for talking to Pacific
        </h1>

        <div className="friend-feedback flex h-[min(40vh,18.5rem)] w-[min(94vw,32rem)] shrink-0 flex-col items-center justify-center rounded-[1.25rem] bg-[#f2f2f2] px-6 max-md:landscape:h-[min(48vh,8.5rem)] max-md:landscape:w-[min(72vw,28rem)] max-md:landscape:px-4">
          <p className="friend-name mb-7 text-center text-[1.05rem] leading-snug text-black max-md:landscape:mb-3 max-md:landscape:text-[0.95rem] md:text-[1.15rem]">
            How was your conversation?
          </p>
          <div
            className="flex items-end gap-3.5 max-md:landscape:gap-3 md:gap-4"
            role="radiogroup"
            aria-label="Conversation rating"
          >
            {[1, 2, 3, 4, 5].map((value) => {
              const filled = rating !== null && value <= rating;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={rating === value}
                  onClick={() => onRate(value)}
                  className="friend-sans flex flex-col items-center gap-2 text-black/45 transition hover:text-black/70 max-md:landscape:gap-1"
                >
                  <Star
                    size={28}
                    weight={filled ? "fill" : "regular"}
                    className={cn(
                      filled ? "text-black/70" : "text-black/35",
                      "max-md:landscape:size-5",
                    )}
                  />
                  <span className="text-[12px] tabular-nums max-md:landscape:text-[11px]">
                    {value}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="friend-sans mt-8 shrink-0 rounded-full border border-black/12 bg-white px-7 py-3 text-[14px] text-black transition hover:bg-black/[0.03] max-md:landscape:mt-0 max-md:landscape:px-5 max-md:landscape:py-2 max-md:landscape:text-[13px]"
        >
          Continue to the next conversation
        </button>
      </div>
    </div>
  );
}

function AccountLink() {
  const { openUserProfile } = useClerk();

  return (
    <>
      <Show when="signed-out">
        <SignInButton mode="redirect" forceRedirectUrl="/">
          <button
            type="button"
            className="friend-sans text-[13px] text-black/70 transition hover:text-black"
          >
            Account
          </button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <button
          type="button"
          onClick={() => openUserProfile()}
          className="friend-sans text-[13px] text-black/70 transition hover:text-black"
        >
          Account
        </button>
      </Show>
    </>
  );
}

function CallBar({
  muted,
  onToggleMute,
  onEnd,
}: {
  muted: boolean;
  onToggleMute: () => void;
  onEnd: () => void;
}) {
  return (
    <div className="friend-callbar flex items-stretch overflow-hidden rounded-[1.65rem] border border-black/10 bg-white max-md:landscape:rounded-[1.25rem]">
      <button
        type="button"
        onClick={onToggleMute}
        aria-pressed={muted}
        className="friend-sans flex min-w-[10rem] items-center justify-center gap-3 px-9 py-4.5 text-[16px] text-black transition hover:bg-black/[0.03] max-md:landscape:min-w-[7.5rem] max-md:landscape:gap-2 max-md:landscape:px-5 max-md:landscape:py-2.5 max-md:landscape:text-[14px]"
      >
        {muted ? (
          <MicrophoneSlash size={22} weight="regular" className="max-md:landscape:size-[18px]" />
        ) : (
          <Microphone size={22} weight="regular" className="max-md:landscape:size-[18px]" />
        )}
        {muted ? "Unmute" : "Mute"}
      </button>
      <div className="w-px self-stretch bg-black/10" aria-hidden />
      <button
        type="button"
        onClick={onEnd}
        className="friend-sans flex min-w-[10rem] items-center justify-center gap-3 px-9 py-4.5 text-[16px] text-black transition hover:bg-black/[0.03] max-md:landscape:min-w-[7.5rem] max-md:landscape:gap-2 max-md:landscape:px-5 max-md:landscape:py-2.5 max-md:landscape:text-[14px]"
      >
        <span className="size-[13px] rounded-[2.5px] bg-black max-md:landscape:size-[11px]" aria-hidden />
        End call
      </button>
    </div>
  );
}

function Presence({
  live,
  speaking,
  thinking,
  connecting,
  levels,
}: {
  live: boolean;
  speaking: boolean;
  thinking: boolean;
  connecting: boolean;
  levels: number[];
}) {
  const energy =
    live && levels.length
      ? levels.reduce((sum, value) => sum + value, 0) / levels.length
      : speaking
        ? 0.65
        : thinking || connecting
          ? 0.28
          : 0.12;

  return (
    <div
      className={cn(
        "friend-orb relative size-[min(40vw,12rem)] rounded-full max-md:landscape:size-[min(34vh,6.75rem)] md:size-[13rem]",
        speaking && "friend-orb-speaking",
        (thinking || connecting) && "friend-orb-thinking",
        !live && "friend-orb-idle",
      )}
      style={{
        transform: `scale(${0.97 + energy * 0.08})`,
      }}
      aria-hidden
    />
  );
}
