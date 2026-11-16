"use client";

import { Show, SignInButton, SignUpButton, useAuth } from "@clerk/nextjs";
import { useAction, useConvex, useMutation } from "convex/react";
import Link from "next/link";
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
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  createEmptyInterviewArtifacts,
  type InterviewArtifacts,
} from "@/lib/interview-artifacts";
import {
  RealtimeVoiceSession,
  type RealtimeStatus,
  type TranscriptLine,
} from "@/lib/realtime-session";
import { inferTriggerTypes, toToolkitSlug } from "@/lib/toolkit";
import { useSessionClock } from "@/lib/use-session-clock";
import { useVoiceLevels } from "@/lib/use-voice-levels";
import { cn } from "@/lib/utils";
import type { WorkflowModel } from "@/lib/workflow-model";
import { createEmptyWorkflowModel } from "@/lib/workflow-model";

type Phase = "idle" | "live" | "ended";

type ShareRequest = { reason: string; whatToShow: string };

export function WorkflowConsultant() {
  const { isSignedIn, isLoaded } = useAuth();
  const createAutomation = useMutation(api.automations.create);
  const runAutomation = useMutation(api.automations.run);
  const rememberKnowledge = useMutation(api.knowledge.remember);
  const requestConnection = useAction(api.composio.requestConnection);
  const checkConnections = useAction(api.composio.checkConnections);
  const discoverTools = useAction(api.composio.discoverTools);
  // One-shot reads for polling a test run without subscribing.
  const convex = useConvex();

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
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [creatingAutomation, setCreatingAutomation] = useState(false);

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
      onFindTools: async ({ toolkits, intent }) => {
        try {
          return await discoverTools({ toolkits, query: intent });
        } catch {
          return [];
        }
      },
      onAwaitTestResult: async (executionId) => {
        // Poll the real execution so the spoken result matches what happened.
        const deadline = Date.now() + 90_000;
        while (Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 2_000));
          try {
            const execution = await convex.query(api.automations.getExecution, {
              id: executionId as Id<"executions">,
            });
            if (!execution) continue;
            const settled =
              execution.status === "succeeded" ||
              execution.status === "failed" ||
              execution.status === "cancelled" ||
              execution.status === "awaiting_approval";
            if (settled) {
              return {
                status: execution.status,
                verified: execution.verification?.verified,
                summary: execution.verification?.summary,
                issues: execution.verification?.issues,
                error: execution.error ?? undefined,
              };
            }
          } catch {
            // Transient read failures are fine; keep polling until the deadline.
          }
        }
        return { status: "running" };
      },
      onConnectIntegration: async (integration) => {
        setConnectingId(integration.id);
        try {
          const checked = await checkConnections({
            toolkits: [integration.toolkit],
          });
          const already = checked.find((c) => c.toolkit === integration.toolkit);
          if (already?.status === "connected") {
            return {
              connected: true,
              connectedAccountId: already.connectedAccountId,
            };
          }

          const callbackUrl = `${window.location.origin}/interview`;
          const link = await requestConnection({
            toolkit: integration.toolkit,
            callbackUrl,
          });
          if (link.redirectUrl) {
            return { connected: false, redirectUrl: link.redirectUrl };
          }
          return {
            connected: false,
            error: "No authorize URL returned for this toolkit",
          };
        } catch (err) {
          return {
            connected: false,
            error: err instanceof Error ? err.message : "Connection failed",
          };
        } finally {
          setConnectingId(null);
        }
      },
      onCreateAutomation: async ({
        proposal,
        readiness,
        integrations,
        test,
      }) => {
        try {
          const toolkits =
            proposal.toolkits?.length
              ? proposal.toolkits
              : integrations.map((i) => i.toolkit);
          const uniqueToolkits = [...new Set(toolkits.map(toToolkitSlug))];
          const connectionStates = uniqueToolkits.length
            ? await checkConnections({ toolkits: uniqueToolkits })
            : [];
          const requiredConnections = uniqueToolkits.map((toolkit) => {
            const state = connectionStates.find((c) => c.toolkit === toolkit);
            const fromUi = integrations.find((i) => i.toolkit === toolkit);
            return {
              toolkit,
              status: (state?.status ??
                (fromUi?.connected ? "connected" : "missing")) as
                | "connected"
                | "missing",
              connectedAccountId:
                state?.connectedAccountId ?? fromUi?.connectedAccountId,
            };
          });

          const missingRequired = requiredConnections.filter(
            (c) => c.status !== "connected",
          );
          const steps =
            proposal.steps?.length
              ? proposal.steps
              : proposal.agentSteps.map((title, index) => ({
                  id: `step_${index + 1}`,
                  title,
                  instruction: title,
                  requiresApproval: false,
                }));

          const triggerTypes =
            proposal.triggerTypes?.length
              ? proposal.triggerTypes
              : inferTriggerTypes(proposal.trigger || readiness.trigger);

          const automationId = await createAutomation({
            name: proposal.name || readiness.agentName,
            description: proposal.outcome || readiness.outcome,
            status: missingRequired.length ? "needs_testing" : "active",
            steps,
            requiredToolkits: uniqueToolkits,
            requiredConnections,
            expectedOutputs: proposal.humanSteps.length
              ? proposal.humanSteps
              : undefined,
            businessRules: proposal.feasibilityNote
              ? [proposal.feasibilityNote]
              : undefined,
            verificationCriteria: [
              "User confirms the result looks correct",
            ],
            trigger: { types: triggerTypes },
            approvalPolicy: {
              requireBeforeExternalSideEffects: true,
              notes: "Ask before consequential external side effects",
            },
            workflowSummary: proposal.outcome || readiness.outcome,
          });

          let executionId: string | undefined;
          if (test && missingRequired.length === 0) {
            executionId = await runAutomation({
              id: automationId as Id<"automations">,
              test: true,
            });
          }

          await rememberKnowledge({
            kind: "workflow",
            title: proposal.name || readiness.agentName,
            content: [
              proposal.outcome || readiness.outcome,
              `Trigger: ${proposal.trigger || readiness.trigger}`,
              `Steps: ${(proposal.agentSteps ?? []).join("; ")}`,
            ]
              .filter(Boolean)
              .join("\n"),
            relatedAutomationId: automationId as Id<"automations">,
          });

          return { automationId, executionId };
        } catch (err) {
          return {
            automationId: "",
            error: err instanceof Error ? err.message : "Create failed",
          };
        }
      },
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
    <AgentReadinessCard
      readiness={artifacts.readiness}
      creating={creatingAutomation}
      onCreate={() => {
        setCreatingAutomation(true);
        void sessionRef.current
          ?.createAutomation({ test: false })
          .finally(() => setCreatingAutomation(false));
      }}
      onCreateAndTest={() => {
        setCreatingAutomation(true);
        void sessionRef.current
          ?.createAutomation({ test: true })
          .finally(() => setCreatingAutomation(false));
      }}
    />
  ) : artifacts.stage === "integrations" && artifacts.integrations.length ? (
    <IntegrationConnectPanel
      integrations={artifacts.integrations}
      connectingId={connectingId}
      onConnect={(id) => {
        void sessionRef.current?.connectIntegration(id);
      }}
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
    const readiness = artifacts.readiness;
    const built = Boolean(readiness?.automationId);
    const working = readiness?.testStatus === "passed";

    return (
      <div className="pacific-surface flex min-h-full flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <VoiceOrb state="idle" />
        <div className="max-w-md space-y-3">
          <h1 className="pr-display text-[2.1rem] leading-tight text-[var(--pr-ink)] md:text-[2.5rem]">
            {working
              ? "Your automation works"
              : built
                ? "Automation built"
                : "Call ended"}
          </h1>
          <p className="text-[14.5px] leading-7 text-[var(--pr-muted)]">
            {working
              ? "It ran for real and the result was verified. You can run it any time."
              : built
                ? "It is saved and ready to test. Nothing runs until you say so."
                : "Nothing was built this time. Start again whenever you want to pick it up."}
          </p>
        </div>

        {readiness ? (
          <div className="w-full max-w-xl">
            <AgentReadinessCard readiness={readiness} />
          </div>
        ) : null}

        <Show when="signed-in">
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {built ? (
              <Link
                href={`/automations/${readiness?.automationId}`}
                className="pr-pill !bg-[var(--pr-dark)] !px-6 !py-3 !text-[13.5px] !text-[var(--pr-cream)] hover:!bg-[var(--pr-dark-hover)]"
              >
                Open automation
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setArtifacts(createEmptyInterviewArtifacts());
                setPhase("idle");
              }}
              className={
                built
                  ? "pr-pill !px-6 !py-3 !text-[13.5px]"
                  : "pr-pill !bg-[var(--pr-dark)] !px-6 !py-3 !text-[13.5px] !text-[var(--pr-cream)] hover:!bg-[var(--pr-dark-hover)]"
              }
            >
              {built ? "Build another" : "Start a new call"}
            </button>
          </div>
        </Show>
        <Show when="signed-out">
          <SignInButton mode="redirect" forceRedirectUrl="/interview">
            <button
              type="button"
              className="pr-pill !bg-[var(--pr-dark)] !px-7 !py-3.5 !text-[14px] !text-[var(--pr-cream)] hover:!bg-[var(--pr-dark-hover)]"
            >
              Sign in to continue
            </button>
          </SignInButton>
        </Show>
      </div>
    );
  }

  return (
    <div className="pacific-surface flex min-h-full flex-1 flex-col">
      {live ? (
        <TranscriptPanel
          transcript={transcript}
          open={transcriptOpen}
          onToggle={() => setTranscriptOpen((v) => !v)}
        />
      ) : null}

      <div
        className={cn(
          "flex min-h-full flex-1 flex-col transition-[margin] duration-300 ease-out",
          live && transcriptOpen
            ? "mr-[min(18rem,88vw)]"
            : live
              ? "mr-11"
              : "mr-0",
        )}
      >
      {live ? (
        <header className="flex items-center justify-end px-6 py-4 md:px-10">
          <Countdown
            remaining={clock.remaining}
            isFinalMinute={clock.isFinalMinute}
          />
        </header>
      ) : null}

      {live ? (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-start gap-4 px-6 pt-1 pb-10">
            <div className="flex flex-col items-center gap-1.5 pt-1">
              <VoiceOrb state={voiceState} levels={waveLevels} />
              <CallStatusLabel
                state={voiceState}
                wrappingUp={clock.isFinalMinute}
              />
            </div>

            {focusPanel}

            <div className="mt-auto flex flex-col items-center gap-3 pt-2">
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
            className="pr-body max-w-md text-center text-[13px] text-[var(--pr-danger)]"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </main>
      ) : (
        <main className="pr-lobby relative flex min-h-full flex-1 flex-col">
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
                className="pr-pill mt-10 cursor-pointer !bg-[var(--pr-dark)] !px-8 !py-3.5 !text-[14px] !tracking-[-0.01em] !text-[var(--pr-cream)] hover:!bg-[var(--pr-dark-hover)]"
              >
                Start call
              </button>
              <p className="pr-body mt-8 text-[12.5px] text-[var(--pr-muted)]">
                Microphone required. Screen sharing only if it helps.
              </p>
            </Show>

            <Show when="signed-out">
              <div className="mt-10 flex flex-col items-center gap-3">
                <SignUpButton mode="redirect" forceRedirectUrl="/interview">
                  <button
                    type="button"
                    className="pr-pill cursor-pointer !bg-[var(--pr-dark)] !px-8 !py-3.5 !text-[14px] !tracking-[-0.01em] !text-[var(--pr-cream)] hover:!bg-[var(--pr-dark-hover)]"
                  >
                    Create account to start
                  </button>
                </SignUpButton>
                <SignInButton mode="redirect" forceRedirectUrl="/interview">
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
                className="pr-body mt-4 max-w-md text-center text-[13px] text-[var(--pr-danger)]"
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
