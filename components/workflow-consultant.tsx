"use client";

import { Show, SignInButton, SignUpButton, useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react";

import { AuthControls } from "@/components/auth-controls";
import {
  AgentReadinessCard,
  AutomationProposalCard,
  CallControls,
  CallStatusLabel,
  Countdown,
  IntegrationConnectPanel,
  LiveWorkflowPanel,
  ScreenSharePrompt,
  SharePreview,
  StopShareHint,
  TranscriptPanel,
  VoiceOrb,
  type VoiceState,
} from "@/components/interview-ui";
import {
  createEmptyInterviewArtifacts,
  type InterviewArtifacts,
} from "@/lib/interview-artifacts";
import {
  RealtimeVoiceSession,
  type RealtimeStatus,
  type TranscriptLine,
} from "@/lib/realtime-session";
import { useSessionClock } from "@/lib/use-session-clock";
import { useVoiceLevels } from "@/lib/use-voice-levels";
import { cn } from "@/lib/utils";
import type { WorkflowModel } from "@/lib/workflow-model";
import { createEmptyWorkflowModel } from "@/lib/workflow-model";

type Phase = "idle" | "live" | "ended";

type ShareRequest = { reason: string; whatToShow: string };

export function WorkflowConsultant() {
  const { isSignedIn, isLoaded } = useAuth();
  const sessionRef = useRef<RealtimeVoiceSession | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const transcriptRef = useRef<TranscriptLine[]>([]);
  const workflowRef = useRef<WorkflowModel>(createEmptyWorkflowModel());
  const endingRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [artifacts, setArtifacts] = useState<InterviewArtifacts>(
    createEmptyInterviewArtifacts(),
  );

  const [micMuted, setMicMuted] = useState(false);
  const [callPaused, setCallPaused] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [screenPaused, setScreenPaused] = useState(false);
  const [framesSent, setFramesSent] = useState(0);
  const [shareRequest, setShareRequest] = useState<ShareRequest | null>(null);
  const [sharePending, setSharePending] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [endedWithReadiness, setEndedWithReadiness] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const live = phase === "live";
  const waveLevels = useVoiceLevels({
    micStream,
    remoteStream,
    enabled: live && !callPaused,
    muted: micMuted || callPaused,
  });

  const voiceState: VoiceState = !live
    ? "idle"
    : callPaused
      ? "paused"
      : status === "connecting"
        ? "connecting"
        : status === "speaking"
          ? "speaking"
          : status === "thinking"
            ? "thinking"
            : micMuted
              ? "muted"
              : "listening";

  const endCall = useCallback(() => {
    if (endingRef.current) return;
    endingRef.current = true;

    const hadReadiness = Boolean(sessionRef.current?.getArtifacts().readiness);
    sessionRef.current?.stop();
    sessionRef.current = null;
    if (previewRef.current) previewRef.current.srcObject = null;

    setScreenSharing(false);
    setScreenPaused(false);
    setShareRequest(null);
    setCallPaused(false);
    setMicStream(null);
    setRemoteStream(null);
    setStatus("idle");
    setSessionStartedAt(null);
    setEndedWithReadiness(hadReadiness);
    setPhase("ended");
    endingRef.current = false;
  }, []);

  const clock = useSessionClock({
    startedAt: sessionStartedAt,
    sessionRef,
    onExpire: useCallback(() => {
      endCall();
    }, [endCall]),
  });

  useEffect(() => {
    return () => {
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, []);

  const bindPreview = useCallback((stream: MediaStream | null) => {
    const video = previewRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!screenSharing) return;
    bindPreview(sessionRef.current?.getScreenStream() ?? null);
  }, [screenSharing, bindPreview]);

  async function startSession() {
    if (!isLoaded || !isSignedIn) {
      setError("Sign in to start a call.");
      return;
    }

    setError(null);
    transcriptRef.current = [];
    workflowRef.current = createEmptyWorkflowModel();
    endingRef.current = false;

    setTranscript([]);
    setArtifacts(createEmptyInterviewArtifacts());
    setMicMuted(false);
    setCallPaused(false);
    setScreenPaused(false);
    setScreenSharing(false);
    setShareRequest(null);
    setFramesSent(0);
    setTranscriptOpen(true);
    setSessionStartedAt(null);
    setEndedWithReadiness(false);
    setMicStream(null);
    setRemoteStream(null);
    setPhase("live");

    const session = new RealtimeVoiceSession({
      onStatus: setStatus,
      onTranscript: (line) => {
        setTranscript((prev) => {
          const next = [...prev, line];
          transcriptRef.current = next;
          return next;
        });
      },
      onError: setError,
      onWorkflowUpdate: (model) => {
        workflowRef.current = model;
      },
      onArtifactsUpdate: setArtifacts,
      onFrameSent: () => setFramesSent((n) => n + 1),
      onRemoteStream: setRemoteStream,
      onScreenState: (state) => {
        setScreenSharing(state.sharing);
        setScreenPaused(state.paused);
        if (!state.sharing) bindPreview(null);
      },
      onScreenShareRequest: (request) => setShareRequest(request),
    });
    sessionRef.current = session;

    try {
      await session.start({ withScreen: false });
      setMicStream(session.getMicStream());
      setRemoteStream(session.getRemoteStream());
      setSessionStartedAt(Date.now());
    } catch (err) {
      session.stop();
      sessionRef.current = null;
      setMicStream(null);
      setRemoteStream(null);
      setStatus("error");
      setPhase("idle");
      setSessionStartedAt(null);
      setError(err instanceof Error ? err.message : "Could not start session");
    }
  }

  async function acceptShare() {
    setSharePending(true);
    try {
      await sessionRef.current?.startScreenSharing();
      setShareRequest(null);
    } catch (err) {
      setShareRequest(null);
      if (
        err instanceof Error &&
        !err.message.includes("permission was denied")
      ) {
        setError(err.message);
      }
    } finally {
      setSharePending(false);
    }
  }

  function declineShare() {
    setShareRequest(null);
    sessionRef.current?.notifyModel(
      "[The user declined to share their screen. Continue on voice without friction.]",
      { triggerResponse: true },
    );
  }

  function toggleMute() {
    if (callPaused) return;
    const next = !micMuted;
    sessionRef.current?.setMicMuted(next);
    setMicMuted(next);
  }

  function togglePause() {
    const next = !callPaused;
    sessionRef.current?.setCallPaused(next);
    setCallPaused(next);
    if (next) setMicMuted(true);
    else setMicMuted(sessionRef.current?.isMicMuted() ?? false);
  }

  /**
   * Exactly one focus surface at a time. Priority:
   * share request → stop-share hint → stage panel → live preview.
   */
  const focusPanel = shareRequest ? (
    <ScreenSharePrompt
      reason={shareRequest.reason}
      whatToShow={shareRequest.whatToShow}
      onAccept={() => void acceptShare()}
      onDecline={declineShare}
      pending={sharePending}
    />
  ) : artifacts.stopShareHint && screenSharing ? (
    <StopShareHint
      message={artifacts.stopShareHint}
      onStop={() =>
        sessionRef.current?.stopScreenSharing({ notifyModel: true })
      }
    />
  ) : artifacts.stage === "readiness" && artifacts.readiness ? (
    <AgentReadinessCard readiness={artifacts.readiness} />
  ) : artifacts.stage === "integrations" && artifacts.integrations.length ? (
    <IntegrationConnectPanel
      integrations={artifacts.integrations}
      onConnect={(id) => sessionRef.current?.connectIntegration(id)}
    />
  ) : artifacts.stage === "automation" && artifacts.automation ? (
    <AutomationProposalCard
      proposal={artifacts.automation}
      onConfirm={() => sessionRef.current?.confirmAutomation(true)}
      onReject={() => sessionRef.current?.confirmAutomation(false)}
    />
  ) : artifacts.stage === "workflow" && artifacts.liveDiagram ? (
    <LiveWorkflowPanel
      diagram={artifacts.liveDiagram}
      onConfirm={() => sessionRef.current?.confirmWorkflow(true)}
      onNeedsFix={() => sessionRef.current?.confirmWorkflow(false)}
    />
  ) : screenSharing ? (
    <SharePreview
      videoRef={previewRef}
      paused={screenPaused}
      framesSent={framesSent}
      onStop={() =>
        sessionRef.current?.stopScreenSharing({ notifyModel: true })
      }
    />
  ) : null;

  if (phase === "ended") {
    return (
      <div className="pacific-surface flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
        <VoiceOrb state="idle" />
        <div className="max-w-md space-y-3">
          <h1 className="pr-display text-3xl text-[var(--pr-ink)] md:text-4xl">
            Call ended
          </h1>
          <p className="pr-body text-[15px] leading-7 text-[var(--pr-muted)]">
            {endedWithReadiness || artifacts.readiness
              ? "Pacific captured what it needs to prepare the agent. Nothing was deployed from this call."
              : "The conversation closed without a report. Start again whenever you want to keep going."}
          </p>
        </div>
        {artifacts.readiness ? (
          <div className="w-full max-w-xl">
            <AgentReadinessCard readiness={artifacts.readiness} />
          </div>
        ) : null}
        <Show when="signed-in">
          <button
            type="button"
            onClick={() => {
              setArtifacts(createEmptyInterviewArtifacts());
              setPhase("idle");
            }}
            className="pr-pill cursor-pointer !bg-[var(--pr-dark)] !px-7 !py-3.5 !text-[14px] !text-[var(--pr-cream)] hover:!bg-[#1d1d20]"
          >
            Start a new call
          </button>
        </Show>
        <Show when="signed-out">
          <SignInButton mode="redirect" forceRedirectUrl="/">
            <button
              type="button"
              className="pr-pill cursor-pointer !bg-[var(--pr-dark)] !px-7 !py-3.5 !text-[14px] !text-[var(--pr-cream)] hover:!bg-[#1d1d20]"
            >
              Sign in to continue
            </button>
          </SignInButton>
        </Show>
      </div>
    );
  }

  return (
    <div className="pacific-surface flex min-h-screen flex-col">
      {live ? (
        <TranscriptPanel
          transcript={transcript}
          open={transcriptOpen}
          onToggle={() => setTranscriptOpen((v) => !v)}
        />
      ) : null}

      <div
        className={cn(
          "flex min-h-screen flex-1 flex-col transition-[margin] duration-300 ease-out",
          live && transcriptOpen
            ? "mr-[min(22rem,92vw)]"
            : live
              ? "mr-12"
              : "mr-0",
        )}
      >
      {live ? (
        <header className="flex items-center justify-between px-6 py-5 md:px-10">
          <span className="pr-label">Pacific</span>
          <Countdown
            remaining={clock.remaining}
            isFinalMinute={clock.isFinalMinute}
          />
        </header>
      ) : null}

      {live ? (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-start gap-6 px-6 pt-2 pb-10">
            <div className="flex flex-col items-center gap-3 pt-2">
              <VoiceOrb state={voiceState} levels={waveLevels} />
              <CallStatusLabel state={voiceState} />
              {clock.isFinalMinute ? (
                <p className="pr-body text-[13px] text-[#a8641a]">
                  Wrapping up soon
                </p>
              ) : null}
            </div>

            {focusPanel}

            <div className="mt-auto flex flex-col items-center gap-3 pt-4">
              <CallControls
                muted={micMuted || callPaused}
                paused={callPaused}
                onToggleMute={toggleMute}
                onTogglePause={togglePause}
                onEnd={endCall}
              />
            </div>

        {error ? (
          <p
            className="pr-body max-w-md text-center text-[13px] text-[#b4472f]"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </main>
      ) : (
        <main className="pr-lobby relative flex min-h-screen flex-1 flex-col">
          <header className="flex items-center justify-between px-8 py-6 md:px-12">
            <span className="pr-label !text-[11px] !tracking-[0.18em] text-[var(--pr-ink)]">
              Pacific
            </span>
            <AuthControls />
          </header>

          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
            <div className="mb-10 opacity-90">
              <VoiceOrb state="idle" />
            </div>

            <div className="space-y-5">
              <h1 className="pr-display text-[2.75rem] leading-[1.05] text-[var(--pr-ink)] md:text-[3.75rem]">
                Pacific
              </h1>
              <p className="pr-body mx-auto max-w-md text-[16px] leading-7 text-[var(--pr-soft)]">
                A five-minute voice call to understand how you work and prepare
                an agent that can take it on.
              </p>
            </div>

            <Show when="signed-in">
              <button
                type="button"
                onClick={() => void startSession()}
                className="pr-pill mt-10 cursor-pointer !bg-[var(--pr-dark)] !px-8 !py-3.5 !text-[14px] !tracking-[-0.01em] !text-[var(--pr-cream)] hover:!bg-[#1d1d20]"
              >
                Start call
              </button>
              <p className="pr-body mt-8 text-[12.5px] text-[var(--pr-muted)]">
                Microphone required. Screen sharing only if it helps.
              </p>
            </Show>

            <Show when="signed-out">
              <div className="mt-10 flex flex-col items-center gap-3">
                <SignUpButton mode="redirect" forceRedirectUrl="/">
                  <button
                    type="button"
                    className="pr-pill cursor-pointer !bg-[var(--pr-dark)] !px-8 !py-3.5 !text-[14px] !tracking-[-0.01em] !text-[var(--pr-cream)] hover:!bg-[#1d1d20]"
                  >
                    Create account to start
                  </button>
                </SignUpButton>
                <SignInButton mode="redirect" forceRedirectUrl="/">
                  <button
                    type="button"
                    className="pr-body cursor-pointer text-[13px] text-[var(--pr-muted)] transition-colors hover:text-[var(--pr-ink)]"
                  >
                    Already have an account? Sign in
                  </button>
                </SignInButton>
              </div>
            </Show>

            {error ? (
              <p
                className="pr-body mt-4 max-w-md text-center text-[13px] text-[#b4472f]"
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </div>
        </main>
      )}
      </div>
    </div>
  );
}
