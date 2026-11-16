"use client";

import { useEffect, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  MonitorOff,
  MonitorPause,
  MonitorPlay,
  PhoneOff,
  Sparkles,
} from "lucide-react";

import { AutomationReportView } from "@/components/automation-report";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  RealtimeVoiceSession,
  type RealtimeStatus,
  type TranscriptLine,
} from "@/lib/realtime-session";
import { cn } from "@/lib/utils";
import type { AutomationReport, WorkflowModel } from "@/lib/workflow-model";
import { createEmptyWorkflowModel } from "@/lib/workflow-model";

function statusCopy(status: RealtimeStatus, micMuted: boolean) {
  switch (status) {
    case "connecting":
      return "Connecting secure session…";
    case "listening":
      return micMuted ? "Muted — AI is waiting" : "Listening — speak naturally";
    case "speaking":
      return "Consultant speaking";
    case "error":
      return "Connection issue — findings preserved";
    default:
      return "Share your screen and talk through a real workflow";
  }
}

export function WorkflowConsultant() {
  const sessionRef = useRef<RealtimeVoiceSession | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const transcriptRef = useRef<TranscriptLine[]>([]);
  const workflowRef = useRef<WorkflowModel>(createEmptyWorkflowModel());

  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowModel>(createEmptyWorkflowModel());
  const [micMuted, setMicMuted] = useState(false);
  const [screenPaused, setScreenPaused] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [aiViewing, setAiViewing] = useState(false);
  const [framesSent, setFramesSent] = useState(0);
  const [phase, setPhase] = useState<"idle" | "live" | "analyzing" | "report">(
    "idle",
  );
  const [report, setReport] = useState<AutomationReport | null>(null);

  const live =
    status === "connecting" || status === "listening" || status === "speaking";

  useEffect(() => {
    return () => {
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcript]);

  function bindPreview(stream: MediaStream | null) {
    const video = previewRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);
  }

  async function startSession() {
    setError(null);
    setReport(null);
    transcriptRef.current = [];
    workflowRef.current = createEmptyWorkflowModel();
    setTranscript([]);
    setWorkflow(createEmptyWorkflowModel());
    setMicMuted(false);
    setScreenPaused(false);
    setFramesSent(0);
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
        setAiViewing(state.viewing);
        bindPreview(sessionRef.current?.getScreenStream() ?? null);
      },
    });
    sessionRef.current = session;

    try {
      await session.start({ withScreen: true });
      bindPreview(session.getScreenStream());
    } catch (err) {
      session.stop();
      sessionRef.current = null;
      setStatus("error");
      setPhase("idle");
      setError(err instanceof Error ? err.message : "Could not start session");
    }
  }

  async function endSession() {
    const session = sessionRef.current;
    const snapshotTranscript = transcriptRef.current;
    const snapshotWorkflow = session?.getWorkflowModel() ?? workflowRef.current;

    session?.stop();
    sessionRef.current = null;
    bindPreview(null);
    setScreenSharing(false);
    setAiViewing(false);
    setScreenPaused(false);
    setStatus("idle");
    setPhase("analyzing");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: snapshotTranscript,
          workflow: snapshotWorkflow,
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
        err instanceof Error ? err.message : "Failed to generate automation report",
      );
    }
  }

  function toggleMute() {
    const next = !micMuted;
    sessionRef.current?.setMicMuted(next);
    setMicMuted(next);
  }

  function toggleScreenPause() {
    const next = !screenPaused;
    sessionRef.current?.setScreenPaused(next);
    setScreenPaused(next);
    setAiViewing(!next && screenSharing);
  }

  if (phase === "report" && report) {
    return (
      <AutomationReportView
        report={report}
        workflow={workflow}
        onNewSession={() => setPhase("idle")}
      />
    );
  }

  if (phase === "analyzing") {
    return (
      <div className="pacific-report flex min-h-screen flex-col items-center justify-center gap-5 px-4 text-center">
        <div className="size-2 animate-pulse rounded-full bg-[var(--pr-ink)]" />
        <h1 className="pr-display text-3xl text-[var(--pr-soft)] md:text-4xl">
          Writing your plan.
        </h1>
        <p className="pr-body max-w-md text-[15px] leading-7 text-[var(--pr-muted)]">
          Turning what you showed into a clear agent blueprint.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:py-12">
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Sparkles className="size-4" />
          <p className="text-xs tracking-[0.18em] uppercase">Pacific</p>
        </div>
        <h1 className="max-w-2xl text-3xl font-normal tracking-tight text-foreground md:text-4xl">
          Show me how you work. I&apos;ll design agents that own the outcome.
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
          Share your screen, talk naturally, and walk through a real process.
          Screenshots stay in memory only while needed — nothing is stored by
          default.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <section className="relative overflow-hidden rounded-2xl border border-border bg-[radial-gradient(circle_at_top,oklch(0.97_0.01_250),oklch(0.94_0.01_80))]">
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,oklch(1_0_0_/0.55))]" />
          <div className="relative aspect-[16/10] w-full">
            {live && screenSharing ? (
              <video
                ref={previewRef}
                className={cn(
                  "size-full object-contain bg-black/90",
                  screenPaused && "opacity-40",
                )}
                muted
                playsInline
                autoPlay
              />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-3 px-6 text-center">
                <MonitorPlay className="size-8 text-muted-foreground" />
                <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Your shared screen will appear here. Switch apps freely while
                  you talk — the session keeps conversational context.
                </p>
              </div>
            )}
          </div>

          <div className="relative flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-background/80 px-4 py-3 backdrop-blur">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <VoiceOrb active={status === "speaking"} listening={status === "listening" && !micMuted} />
              <div>
                <p className="text-foreground">{statusCopy(status, micMuted)}</p>
                <p className="text-xs text-muted-foreground">
                  {aiViewing
                    ? `AI viewing screen · ${framesSent} frames sent`
                    : screenSharing && screenPaused
                      ? "Screen paused — AI is not receiving frames"
                      : live
                        ? "AI listening · screen not shared"
                        : "Mic + screen required to start"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!live ? (
                <Button type="button" size="lg" onClick={startSession} className="min-w-36">
                  Start Session
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={toggleMute}
                    aria-pressed={micMuted}
                  >
                    {micMuted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                    {micMuted ? "Unmute" : "Mute"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={toggleScreenPause}
                    disabled={!screenSharing}
                    aria-pressed={screenPaused}
                  >
                    {screenPaused ? (
                      <MonitorPlay className="size-4" />
                    ) : (
                      <MonitorPause className="size-4" />
                    )}
                    {screenPaused ? "Resume screen" : "Pause screen"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => sessionRef.current?.stopScreenSharing()}
                    disabled={!screenSharing}
                  >
                    <MonitorOff className="size-4" />
                    Stop share
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={endSession}
                  >
                    <PhoneOff className="size-4" />
                    End Session
                  </Button>
                </>
              )}
            </div>
          </div>
        </section>

        <aside className="flex min-h-[420px] flex-col rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm text-foreground">Live transcript</p>
            <p className="text-xs text-muted-foreground">
              Kept in sync with the conversation. Not a questionnaire.
            </p>
          </div>
          <ScrollArea className="h-[420px] px-4 py-3">
            {transcript.length === 0 ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                When the session starts, Pacific will ask what outcome you want
                and which workflow to walk through.
              </p>
            ) : (
              <div className="space-y-4 pr-2">
                {transcript.map((line) => (
                  <div key={line.id} className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {line.role === "user"
                        ? "You"
                        : line.role === "assistant"
                          ? "Consultant"
                          : "System"}
                    </p>
                    <p className="text-sm leading-relaxed text-foreground">
                      {line.text}
                    </p>
                  </div>
                ))}
                <div ref={transcriptEndRef} />
              </div>
            )}
          </ScrollArea>

          {(workflow.applications.length > 0 ||
            workflow.steps.length > 0 ||
            workflow.questions.length > 0) && (
            <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
              <p className="mb-1 text-foreground">Quiet notes</p>
              {workflow.name ? <p>Workflow: {workflow.name}</p> : null}
              {workflow.applications.length > 0 ? (
                <p>Apps: {workflow.applications.join(", ")}</p>
              ) : null}
              {workflow.steps.length > 0 ? (
                <p>{workflow.steps.length} steps captured</p>
              ) : null}
            </div>
          )}
        </aside>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function VoiceOrb({
  active,
  listening,
}: {
  active: boolean;
  listening: boolean;
}) {
  return (
    <div className="relative flex size-10 items-center justify-center">
      <span
        className={cn(
          "absolute inset-0 rounded-full bg-foreground/10 transition-opacity",
          active || listening ? "opacity-100" : "opacity-40",
        )}
      />
      <span
        className={cn(
          "absolute size-7 rounded-full bg-foreground/15",
          active && "animate-ping",
          listening && !active && "animate-pulse",
        )}
      />
      <span className="relative size-3 rounded-full bg-foreground" />
    </div>
  );
}
