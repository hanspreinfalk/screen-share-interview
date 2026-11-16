"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AutomationReportView } from "@/components/automation-report";
import {
  CapturedApps,
  Countdown,
  ScreenSharePrompt,
  SharePreview,
  TranscriptPanel,
  VoiceOrb,
  type VoiceState,
} from "@/components/interview-ui";
import {
  RealtimeVoiceSession,
  type RealtimeStatus,
  type TranscriptLine,
} from "@/lib/realtime-session";
import { useSessionClock } from "@/lib/use-session-clock";
import { cn } from "@/lib/utils";
import type { AutomationReport, WorkflowModel } from "@/lib/workflow-model";
import { createEmptyWorkflowModel } from "@/lib/workflow-model";

type Phase = "idle" | "live" | "analyzing" | "report";

type ShareRequest = { reason: string; whatToShow: string };

function statusLine(state: VoiceState, finalMinute: boolean) {
  switch (state) {
    case "connecting":
      return "Connecting";
    case "speaking":
      return "Pacific is speaking";
    case "muted":
      return "You are muted";
    case "listening":
      return finalMinute ? "Almost done, go ahead" : "Listening";
    default:
      return "Ready";
  }
}

export function WorkflowConsultant() {
  const sessionRef = useRef<RealtimeVoiceSession | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const transcriptRef = useRef<TranscriptLine[]>([]);
  const workflowRef = useRef<WorkflowModel>(createEmptyWorkflowModel());
  const screenUsedRef = useRef(false);
  const endingRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowModel>(
    createEmptyWorkflowModel(),
  );
  const [report, setReport] = useState<AutomationReport | null>(null);

  const [micMuted, setMicMuted] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [screenPaused, setScreenPaused] = useState(false);
  const [framesSent, setFramesSent] = useState(0);
  const [shareRequest, setShareRequest] = useState<ShareRequest | null>(null);
  const [sharePending, setSharePending] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  /**
   * Wall-clock start of the 5 minute budget. Set once the connection is open
   * so permission prompts and handshake latency do not eat the user's time.
   */
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);

  const live = phase === "live";

  const voiceState: VoiceState = !live
    ? "idle"
    : status === "connecting"
      ? "connecting"
      : status === "speaking"
        ? "speaking"
        : micMuted
          ? "muted"
          : "listening";

  /**
   * Tears the session down and generates the report. Guarded so the 5 minute
   * expiry and a manual Finish cannot both run it.
   */
  const endSession = useCallback(async (reason: "manual" | "timeout") => {
    if (endingRef.current) return;
    endingRef.current = true;

    const session = sessionRef.current;
    const snapshotTranscript = transcriptRef.current;
    const snapshotWorkflow = session?.getWorkflowModel() ?? workflowRef.current;
    const usedScreen = screenUsedRef.current;

    session?.stop();
    sessionRef.current = null;
    if (previewRef.current) previewRef.current.srcObject = null;

    setScreenSharing(false);
    setScreenPaused(false);
    setShareRequest(null);
    setStatus("idle");
    setSessionStartedAt(null);
    setPhase("analyzing");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: snapshotTranscript,
          workflow: snapshotWorkflow,
          screenSharingUsed: usedScreen,
          endedBy: reason,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not generate report");
      }
      setReport(payload.report as AutomationReport);
      setPhase("report");
    } catch (err) {
      setPhase("idle");
      setError(
        err instanceof Error
          ? err.message
          : "Failed to generate automation report",
      );
    } finally {
      endingRef.current = false;
    }
  }, []);

  const clock = useSessionClock({
    startedAt: sessionStartedAt,
    sessionRef,
    onExpire: useCallback(() => {
      void endSession("timeout");
    }, [endSession]),
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

  // The preview element only mounts once sharing starts, so attach the stream
  // after that render rather than inside the state callback.
  useEffect(() => {
    if (!screenSharing) return;
    bindPreview(sessionRef.current?.getScreenStream() ?? null);
  }, [screenSharing, bindPreview]);

  async function startSession() {
    setError(null);
    setReport(null);
    transcriptRef.current = [];
    workflowRef.current = createEmptyWorkflowModel();
    screenUsedRef.current = false;
    endingRef.current = false;

    setTranscript([]);
    setWorkflow(createEmptyWorkflowModel());
    setMicMuted(false);
    setScreenPaused(false);
    setScreenSharing(false);
    setShareRequest(null);
    setFramesSent(0);
    setTranscriptOpen(false);
    setSessionStartedAt(null);
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
        setWorkflow(model);
      },
      onFrameSent: () => setFramesSent((n) => n + 1),
      onScreenState: (state) => {
        setScreenSharing(state.sharing);
        setScreenPaused(state.paused);
        if (state.sharing) screenUsedRef.current = true;
        if (!state.sharing) bindPreview(null);
      },
      onScreenShareRequest: (request) => setShareRequest(request),
    });
    sessionRef.current = session;

    try {
      // Voice only. Screen sharing is offered later, and only if it helps.
      await session.start({ withScreen: false });
      // Start the 5 minute budget only once we are actually connected.
      setSessionStartedAt(Date.now());
    } catch (err) {
      session.stop();
      sessionRef.current = null;
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
      // Declining at the browser prompt is a normal outcome, not an error.
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
      "[The user declined to share their screen. Continue on voice without friction, do not ask again, and do not imply the report will be weaker.]",
      { triggerResponse: true },
    );
  }

  function toggleMute() {
    const next = !micMuted;
    sessionRef.current?.setMicMuted(next);
    setMicMuted(next);
  }

  if (phase === "report" && report) {
    return (
      <AutomationReportView
        report={report}
        workflow={workflow}
        onNewSession={() => {
          setReport(null);
          setPhase("idle");
        }}
      />
    );
  }

  if (phase === "analyzing") {
    return (
      <div className="pacific-surface flex min-h-screen flex-col items-center justify-center gap-5 px-4 text-center">
        <div className="size-2 animate-pulse rounded-full bg-[var(--pr-ink)]" />
        <h1 className="pr-display text-3xl text-[var(--pr-soft)] md:text-4xl">
          Writing your plan.
        </h1>
        <p className="pr-body max-w-md text-[15px] leading-7 text-[var(--pr-muted)]">
          Turning what you described into a clear agent blueprint.
        </p>
      </div>
    );
  }

  return (
    <div className="pacific-surface flex min-h-screen flex-col">
      {live ? (
        <header className="flex items-center justify-between px-6 py-5 md:px-10">
          <span className="pr-label">Pacific</span>
          <Countdown
            remaining={clock.remaining}
            isFinalMinute={clock.isFinalMinute}
          />
        </header>
      ) : null}

      <main
        className={cn(
          "mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-6",
          live ? "justify-start gap-7 pt-4 pb-10" : "justify-center gap-8 py-16",
        )}
      >
        {live ? (
          <>
            <VoiceOrb state={voiceState} />

            <div className="space-y-2 text-center">
              <p
                className="pr-body text-[15px] text-[var(--pr-soft)]"
                aria-live="polite"
              >
                {statusLine(voiceState, clock.isFinalMinute)}
              </p>
              {clock.isFinalMinute ? (
                <p className="pr-rise pr-body text-[13px] text-[#a8641a]">
                  Wrapping up, your report starts automatically.
                </p>
              ) : null}
            </div>

            {shareRequest ? (
              <ScreenSharePrompt
                reason={shareRequest.reason}
                whatToShow={shareRequest.whatToShow}
                onAccept={() => void acceptShare()}
                onDecline={declineShare}
                pending={sharePending}
              />
            ) : null}

            {screenSharing ? (
              <SharePreview
                videoRef={previewRef}
                paused={screenPaused}
                framesSent={framesSent}
                onStop={() => sessionRef.current?.stopScreenSharing({ notifyModel: true })}
              />
            ) : null}

            <CapturedApps applications={workflow.applications} />

            <TranscriptPanel
              transcript={transcript}
              open={transcriptOpen}
              onToggle={() => setTranscriptOpen((v) => !v)}
            />

            <div className="mt-auto flex items-center gap-2.5 pt-6">
              <button
                type="button"
                onClick={toggleMute}
                aria-pressed={micMuted}
                className={cn(
                  "pr-body rounded-full border px-4 py-2.5 text-[13px] transition-colors",
                  micMuted
                    ? "border-[rgba(23,23,25,0.2)] bg-[var(--pr-dark)] text-[var(--pr-cream)]"
                    : "border-[var(--pr-line)] bg-white text-[var(--pr-soft)] hover:border-[rgba(23,23,25,0.18)]",
                )}
              >
                {micMuted ? "Unmute" : "Mute"}
              </button>
              <button
                type="button"
                onClick={() => void endSession("manual")}
                className="pr-pill !bg-[var(--pr-dark)] !text-[var(--pr-cream)] hover:!bg-[#1d1d20]"
              >
                Finish and get report
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="max-w-xl space-y-5 text-center">
              <span className="pr-label">Pacific</span>
              <h1 className="pr-display text-[2.6rem] text-[var(--pr-ink)] md:text-[3.4rem]">
                Tell me how you work.
              </h1>
              <p className="pr-body mx-auto max-w-md text-[15.5px] leading-7 text-[var(--pr-muted)]">
                A five minute conversation about one real workflow. I will map
                how you do it today, then design agents that could own the
                outcome.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void startSession()}
              className="pr-pill !bg-[var(--pr-dark)] !px-7 !py-3.5 !text-[14px] !text-[var(--pr-cream)] hover:!bg-[#1d1d20]"
            >
              Start conversation
            </button>

            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {[
                "Voice only to start",
                "Screen sharing only if it helps",
                "Ends at five minutes",
              ].map((item) => (
                <span
                  key={item}
                  className="pr-body flex items-center gap-2 text-[12.5px] text-[var(--pr-muted)]"
                >
                  <span
                    aria-hidden
                    className="size-1 rounded-full bg-[rgba(23,23,25,0.3)]"
                  />
                  {item}
                </span>
              ))}
            </div>
          </>
        )}

        {error ? (
          <p
            className="pr-body max-w-md text-center text-[13px] text-[#b4472f]"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </main>
    </div>
  );
}
