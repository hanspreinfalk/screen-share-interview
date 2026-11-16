import {
  framesAreSimilar,
  ScreenFrameCapture,
  type CapturedFrame,
} from "@/lib/frame-capture";
import {
  createEmptyInterviewArtifacts,
  normalizeEvidenceSource,
  type AgentReadiness,
  type AutomationProposal,
  type IntegrationRequirement,
  type InterviewArtifacts,
  type LiveWorkflowDiagram,
} from "@/lib/interview-artifacts";
import type { RealtimeStatus, TranscriptLine } from "@/lib/session-types";
import {
  createEmptyWorkflowModel,
  mergeWorkflowModel,
  type AgentDiagram,
  type AgentDiagramEdge,
  type AgentDiagramNode,
  type WorkflowDiagramEdge,
  type WorkflowDiagramNode,
  type WorkflowModel,
} from "@/lib/workflow-model";

export type { RealtimeStatus, TranscriptLine };

type SessionHandles = {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  mic: MediaStream;
  audio: HTMLAudioElement;
  micSender: RTCRtpSender | null;
};

type RealtimeServerEvent = {
  type?: string;
  delta?: string;
  transcript?: string;
  error?: { message?: string };
  call_id?: string;
  name?: string;
  arguments?: string;
  item?: {
    id?: string;
    type?: string;
    status?: string;
    role?: string;
    content?: Array<{ type?: string; transcript?: string; text?: string }>;
  };
  response?: {
    status?: string;
    output?: Array<{
      type?: string;
      name?: string;
      call_id?: string;
      arguments?: string;
    }>;
  };
};

function waitForIceGathering(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();

  return new Promise<void>((resolve) => {
    const onChange = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", onChange);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", onChange);
  });
}

async function requestDisplayMedia() {
  try {
    return await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 5, max: 10 },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
  } catch (error) {
    throw new Error(
      error instanceof Error && error.name === "NotAllowedError"
        ? "Screen sharing permission was denied"
        : "Could not start screen sharing",
    );
  }
}

export type RealtimeSessionCallbacks = {
  onStatus?: (status: RealtimeStatus) => void;
  onTranscript?: (line: TranscriptLine) => void;
  onError?: (message: string) => void;
  onWorkflowUpdate?: (model: WorkflowModel) => void;
  onArtifactsUpdate?: (artifacts: InterviewArtifacts) => void;
  onFrameSent?: (info: { fingerprint: string; forced: boolean }) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onScreenState?: (state: {
    sharing: boolean;
    paused: boolean;
    viewing: boolean;
  }) => void;
  /** Pacific decided watching would help. Surface a Share Screen button. */
  onScreenShareRequest?: (request: {
    reason: string;
    whatToShow: string;
  }) => void;
};

export class RealtimeVoiceSession {
  private handles: SessionHandles | null = null;
  private assistantBuffer = "";
  private userBuffer = "";
  private workflowModel: WorkflowModel = createEmptyWorkflowModel();
  private artifacts: InterviewArtifacts = createEmptyInterviewArtifacts();
  private frameCapture = new ScreenFrameCapture();
  private screenStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private frameTimer: ReturnType<typeof setInterval> | null = null;
  private lastFingerprint: string | null = null;
  private screenPaused = false;
  private micMuted = false;
  private callPaused = false;
  private sendingFrame = false;
  private startedAt = 0;
  private handledToolCalls = new Set<string>();
  private status: RealtimeStatus = "idle";
  /** True while the Realtime API is generating a response. */
  private responseInFlight = false;
  /** Coalesce extra response.create calls until the active one finishes. */
  private responseQueued = false;

  constructor(private readonly callbacks: RealtimeSessionCallbacks = {}) {}

  getWorkflowModel() {
    return this.workflowModel;
  }

  getArtifacts() {
    return this.artifacts;
  }

  isCallPaused() {
    return this.callPaused;
  }

  getScreenStream() {
    return this.screenStream;
  }

  getMicStream() {
    return this.handles?.mic ?? null;
  }

  getRemoteStream() {
    return this.remoteStream;
  }

  isMicMuted() {
    return this.micMuted;
  }

  isScreenPaused() {
    return this.screenPaused;
  }

  private setStatus(status: RealtimeStatus) {
    if (this.callPaused && status !== "paused" && status !== "idle" && status !== "error") {
      return;
    }
    this.status = status;
    this.callbacks.onStatus?.(status);
  }

  /**
   * Pause or resume the whole call: mic off, remote audio muted, AI notified.
   * Distinct from mute, which only silences the microphone.
   */
  setCallPaused(paused: boolean) {
    if (!this.handles) return;
    this.callPaused = paused;

    const micTrack = this.handles.mic.getAudioTracks()[0];
    if (micTrack) {
      micTrack.enabled = !paused && !this.micMuted;
    }
    this.handles.audio.muted = paused;

    if (paused) {
      this.setStatus("paused");
      this.notifyModel(
        "[The user paused the call. Wait silently. Do not speak until they resume.]",
      );
    } else {
      this.setStatus("listening");
      this.notifyModel(
        "[The user resumed the call. Continue naturally from where you left off.]",
        { triggerResponse: true },
      );
    }
  }

  private setArtifacts(next: InterviewArtifacts) {
    this.artifacts = next;
    this.callbacks.onArtifactsUpdate?.(next);
  }

  private replyToTool(
    callId: string,
    output: Record<string, unknown>,
    options?: { triggerResponse?: boolean },
  ) {
    this.sendEvent({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(output),
      },
    });
    if (options?.triggerResponse !== false) {
      this.requestResponse();
    }
  }

  /**
   * Ask the model to speak/act. Safe to call while a response is already
   * running: extras are coalesced into a single follow-up turn.
   */
  private requestResponse() {
    if (this.responseInFlight) {
      this.responseQueued = true;
      return;
    }
    this.responseInFlight = true;
    this.responseQueued = false;
    this.sendEvent({ type: "response.create" });
  }

  private finishResponse() {
    this.responseInFlight = false;
    if (this.responseQueued) {
      this.responseQueued = false;
      this.requestResponse();
    }
  }

  /**
   * User confirmed or corrected the live workflow diagram via UI controls.
   */
  confirmWorkflow(confirmed: boolean, note?: string) {
    if (!this.artifacts.liveDiagram) return;

    const confirmation = confirmed ? "confirmed" : "needs_fix";
    this.setArtifacts({
      ...this.artifacts,
      liveDiagram: {
        ...this.artifacts.liveDiagram,
        confirmation,
        confirmPrompt: null,
      },
    });

    this.notifyModel(
      confirmed
        ? `[The user confirmed the workflow diagram is accurate${note ? `: ${note}` : ""}. You may now propose an automation.]`
        : `[The user said the workflow diagram needs a fix${note ? `: ${note}` : ""}. Ask what is wrong, update show_workflow_diagram, and confirm again.]`,
      { triggerResponse: true },
    );
  }

  /**
   * User accepted or rejected the proposed automation.
   */
  confirmAutomation(confirmed: boolean) {
    if (!this.artifacts.automation) return;

    const status = confirmed ? "confirmed" : "rejected";
    this.setArtifacts({
      ...this.artifacts,
      automation: {
        ...this.artifacts.automation,
        status,
      },
    });

    this.notifyModel(
      confirmed
        ? "[The user confirmed this automation. Call show_integrations for the apps it needs, then show_agent_readiness when requirements are clear.]"
        : "[The user rejected this automation. Ask what they would prefer and propose a better fit. Do not proceed with integrations for the rejected plan.]",
      { triggerResponse: true },
    );
  }

  /**
   * Simulated OAuth connect for a required integration button.
   */
  connectIntegration(id: string) {
    const integrations = this.artifacts.integrations.map((item) =>
      item.id === id ? { ...item, connected: true } : item,
    );
    const connected = integrations.find((item) => item.id === id);
    if (!connected) return;

    this.setArtifacts({
      ...this.artifacts,
      integrations,
    });

    this.notifyModel(
      `[The user clicked Connect ${connected.app}. Treat this as a simulated connection for this session only, not real OAuth. Update readiness accordingly.]`,
      { triggerResponse: true },
    );
  }

  async start(options?: { withScreen?: boolean }) {
    this.setStatus("connecting");
    this.workflowModel = createEmptyWorkflowModel();
    this.artifacts = createEmptyInterviewArtifacts();
    this.callbacks.onWorkflowUpdate?.(this.workflowModel);
    this.callbacks.onArtifactsUpdate?.(this.artifacts);
    this.startedAt = Date.now();

    const tokenResponse = await fetch("/api/realtime/token", {
      method: "POST",
    });
    const tokenPayload = await tokenResponse.json();
    if (!tokenResponse.ok) {
      throw new Error(tokenPayload.error ?? "Could not create session token");
    }

    const ephemeralKey = tokenPayload.value as string | undefined;
    if (!ephemeralKey) {
      throw new Error("Missing ephemeral client secret");
    }

    // Voice first: screen sharing is opt-in and can start later in the call.
    let screen: MediaStream | null = null;
    if (options?.withScreen === true) {
      screen = await requestDisplayMedia();
    }

    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (error) {
      screen?.getTracks().forEach((track) => track.stop());
      throw new Error(
        error instanceof Error && error.name === "NotAllowedError"
          ? "Microphone permission was denied"
          : "Could not access microphone",
      );
    }

    const pc = new RTCPeerConnection();
    const audio = document.createElement("audio");
    audio.autoplay = true;
    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      this.remoteStream = stream;
      audio.srcObject = stream;
      this.callbacks.onRemoteStream?.(stream);
    };

    const micTrack = mic.getAudioTracks()[0];
    const micSender = pc.addTrack(micTrack, mic);

    const dc = pc.createDataChannel("oai-events");
    dc.addEventListener("open", () => {
      this.setStatus("listening");
      this.responseInFlight = false;
      this.responseQueued = false;
      this.requestResponse();
    });
    dc.addEventListener("message", (event) => {
      try {
        this.handleServerEvent(JSON.parse(event.data) as RealtimeServerEvent);
      } catch {
        this.callbacks.onError?.("Failed to parse Realtime event");
      }
    });

    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        this.callbacks.onError?.(
          "Realtime connection dropped. Your notes so far are preserved.",
        );
        this.setStatus("error");
      }
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGathering(pc);

    const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      body: pc.localDescription?.sdp,
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        "Content-Type": "application/sdp",
      },
    });

    if (!sdpResponse.ok) {
      mic.getTracks().forEach((track) => track.stop());
      screen?.getTracks().forEach((track) => track.stop());
      pc.close();
      const detail = await sdpResponse.text();
      throw new Error(detail || "WebRTC handshake failed");
    }

    await pc.setRemoteDescription({
      type: "answer",
      sdp: await sdpResponse.text(),
    });

    this.handles = { pc, dc, mic, audio, micSender };
    this.micMuted = false;
    this.callPaused = false;

    if (screen) {
      this.attachScreen(screen);
    }
  }

  private attachScreen(screen: MediaStream) {
    this.screenStream = screen;
    this.screenPaused = false;
    this.frameCapture.attach(screen);
    this.callbacks.onScreenState?.({
      sharing: true,
      paused: false,
      viewing: true,
    });

    const [videoTrack] = screen.getVideoTracks();
    // Fires when the user stops sharing from the browser's own UI.
    videoTrack?.addEventListener("ended", () => {
      this.stopScreenSharing({ notifyModel: true });
    });

    this.startFrameLoop();
  }

  private startFrameLoop() {
    this.stopFrameLoop();
    this.frameTimer = setInterval(() => {
      void this.captureAndSendFrame({ forced: false, detail: "low" });
    }, 2000);
  }

  private stopFrameLoop() {
    if (this.frameTimer) {
      clearInterval(this.frameTimer);
      this.frameTimer = null;
    }
  }

  /**
   * Begin screen sharing partway through a call, either because Pacific asked
   * or the user volunteered. Tells the model the result so it can react in
   * its next turn instead of waiting silently.
   */
  async startScreenSharing() {
    if (this.screenStream) return true;
    if (!this.handles) throw new Error("Session is not active");

    let screen: MediaStream;
    try {
      screen = await requestDisplayMedia();
    } catch (error) {
      this.notifyModel(
        "[The user declined screen sharing. Continue on voice, do not ask again, and do not imply the result will be worse.]",
      );
      throw error;
    }

    this.attachScreen(screen);
    this.notifyModel(
      "[The user is now sharing their screen. Thank them briefly, then ask them to walk through the step while you watch.]",
    );
    return true;
  }

  /**
   * Send a non-spoken system note into the conversation. Used for time
   * remaining and screen-share state so Pacific can pace itself.
   */
  notifyModel(text: string, options?: { triggerResponse?: boolean }) {
    const sent = this.sendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    });
    if (sent && options?.triggerResponse) {
      this.requestResponse();
    }
    return sent;
  }

  setMicMuted(muted: boolean) {
    this.micMuted = muted;
    if (this.callPaused) return;
    const track = this.handles?.mic.getAudioTracks()[0];
    if (track) track.enabled = !muted;
  }

  setScreenPaused(paused: boolean) {
    if (!this.screenStream) return;
    this.screenPaused = paused;
    this.screenStream.getVideoTracks().forEach((track) => {
      track.enabled = !paused;
    });
    this.callbacks.onScreenState?.({
      sharing: true,
      paused,
      viewing: !paused,
    });
    if (paused) {
      this.stopFrameLoop();
    } else {
      this.startFrameLoop();
    }
  }

  stopScreenSharing(options?: { notifyModel?: boolean }) {
    const wasSharing = Boolean(this.screenStream);
    this.stopFrameLoop();
    this.frameCapture.detach();
    this.screenStream?.getTracks().forEach((track) => track.stop());
    this.screenStream = null;
    this.screenPaused = false;
    this.lastFingerprint = null;

    if (this.artifacts.stopShareHint) {
      this.setArtifacts({
        ...this.artifacts,
        stopShareHint: null,
      });
    }

    this.callbacks.onScreenState?.({
      sharing: false,
      paused: false,
      viewing: false,
    });

    if (wasSharing && options?.notifyModel) {
      this.notifyModel(
        "[The user stopped sharing their screen. Acknowledge briefly if natural and continue on voice. You may request a different demonstration later if needed.]",
      );
    }
  }

  async requestFreshScreenshot(detail: "low" | "high" = "high") {
    return this.captureAndSendFrame({ forced: true, detail, triggerResponse: false });
  }

  private sendEvent(payload: unknown) {
    const dc = this.handles?.dc;
    if (!dc || dc.readyState !== "open") return false;
    dc.send(JSON.stringify(payload));
    return true;
  }

  private elapsedLabel() {
    const seconds = Math.max(0, Math.round((Date.now() - this.startedAt) / 1000));
    return `T+${seconds}s`;
  }

  private async captureAndSendFrame(options: {
    forced: boolean;
    detail: "low" | "high";
    triggerResponse?: boolean;
    note?: string;
  }): Promise<CapturedFrame | null> {
    if (this.sendingFrame) return null;
    if (!this.screenStream || this.screenPaused) return null;
    if (!this.handles?.dc || this.handles.dc.readyState !== "open") return null;
    // Avoid flooding the model mid-utterance; forced requests still go through.
    if (!options.forced && this.status === "speaking") return null;

    this.sendingFrame = true;
    try {
      const quality = options.detail === "high" ? 0.78 : 0.58;
      const frame = this.frameCapture.capture(quality);
      if (!frame) return null;

      if (
        !options.forced &&
        this.lastFingerprint &&
        framesAreSimilar(this.lastFingerprint, frame.fingerprint)
      ) {
        return null;
      }

      this.lastFingerprint = frame.fingerprint;

      const note =
        options.note ??
        `[Screen frame ${this.elapsedLabel()}, not spoken by the user. Observe silently unless relevant to the active conversation. Never invent UI that is not visible.]`;

      const sent = this.sendEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_image",
              image_url: frame.dataUrl,
              detail: options.detail,
            },
            {
              type: "input_text",
              text: note,
            },
          ],
        },
      });

      if (!sent) return null;

      if (options.triggerResponse) {
        this.requestResponse();
      }

      this.callbacks.onFrameSent?.({
        fingerprint: frame.fingerprint,
        forced: options.forced,
      });

      return frame;
    } catch {
      this.callbacks.onError?.("Failed to send a screen frame");
      return null;
    } finally {
      this.sendingFrame = false;
    }
  }

  stop() {
    this.stopFrameLoop();
    this.frameCapture.detach();
    this.screenStream?.getTracks().forEach((track) => track.stop());
    this.screenStream = null;

    const handles = this.handles;
    this.handles = null;
    this.assistantBuffer = "";
    this.userBuffer = "";
    this.lastFingerprint = null;
    this.screenPaused = false;
    this.micMuted = false;
    this.callPaused = false;
    this.responseInFlight = false;
    this.responseQueued = false;
    this.remoteStream = null;
    this.handledToolCalls.clear();

    if (!handles) {
      this.setStatus("idle");
      this.callbacks.onScreenState?.({
        sharing: false,
        paused: false,
        viewing: false,
      });
      return;
    }

    handles.mic.getTracks().forEach((track) => track.stop());
    try {
      handles.dc.close();
    } catch {
      /* ignore */
    }
    handles.pc.close();
    handles.audio.srcObject = null;
    this.setStatus("idle");
    this.callbacks.onScreenState?.({
      sharing: false,
      paused: false,
      viewing: false,
    });
  }

  private emitTranscript(role: TranscriptLine["role"], text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.callbacks.onTranscript?.({
      id: crypto.randomUUID(),
      role,
      text: trimmed,
      at: new Date().toISOString(),
    });
  }

  private handleToolCall(call: {
    name?: string;
    call_id?: string;
    arguments?: string;
  }) {
    if (!call.call_id || !call.name) return;
    if (this.handledToolCalls.has(call.call_id)) return;
    this.handledToolCalls.add(call.call_id);

    let args: Record<string, unknown> = {};
    try {
      args = call.arguments ? (JSON.parse(call.arguments) as Record<string, unknown>) : {};
    } catch {
      args = {};
    }

    if (call.name === "update_workflow_model") {
      const patch = { ...args } as Partial<WorkflowModel> & {
        observation?: { text: string; source: "observed" | "explained" | "inferred" };
      };
      const observation = patch.observation;
      delete (patch as { observation?: unknown }).observation;

      if (observation?.text) {
        patch.observations = [
          {
            id: crypto.randomUUID(),
            text: observation.text,
            source: observation.source,
            at: new Date().toISOString(),
          },
        ];
      }

      this.workflowModel = mergeWorkflowModel(this.workflowModel, patch);
      this.callbacks.onWorkflowUpdate?.(this.workflowModel);
      this.replyToTool(call.call_id, {
        ok: true,
        updatedAt: this.workflowModel.updatedAt,
      });
      return;
    }

    if (call.name === "show_workflow_diagram") {
      const nodes = parseWorkflowNodes(args.nodes);
      const edges = parseWorkflowEdges(args.edges);
      if (!nodes.length) {
        this.replyToTool(call.call_id, {
          ok: false,
          message: "Diagram needs at least one node.",
        });
        return;
      }

      const previous = this.artifacts.liveDiagram;
      const diagram: LiveWorkflowDiagram = {
        title:
          typeof args.title === "string" && args.title.trim()
            ? args.title.trim()
            : "Your workflow",
        summary:
          typeof args.summary === "string" ? args.summary.trim() : "",
        nodes,
        edges,
        revision: (previous?.revision ?? 0) + 1,
        confirmation: "pending",
        confirmPrompt: null,
      };

      this.setArtifacts({
        ...this.artifacts,
        stage: "workflow",
        liveDiagram: diagram,
      });

      this.replyToTool(call.call_id, {
        ok: true,
        revision: diagram.revision,
        nodeCount: nodes.length,
        message:
          "Diagram is visible. Ask the user to confirm with ask_workflow_confirmation.",
      });
      return;
    }

    if (call.name === "ask_workflow_confirmation") {
      if (!this.artifacts.liveDiagram) {
        this.replyToTool(call.call_id, {
          ok: false,
          message: "Show a workflow diagram before asking for confirmation.",
        });
        return;
      }

      const confirmPrompt =
        typeof args.prompt === "string" && args.prompt.trim()
          ? args.prompt.trim()
          : "Does this match how you actually do it?";

      this.setArtifacts({
        ...this.artifacts,
        liveDiagram: {
          ...this.artifacts.liveDiagram,
          confirmation: "pending",
          confirmPrompt,
        },
      });

      this.replyToTool(call.call_id, {
        ok: true,
        message:
          "Confirm controls are visible. Wait for the user to confirm or request a fix.",
      });
      return;
    }

    if (call.name === "propose_automation") {
      if (this.artifacts.liveDiagram?.confirmation !== "confirmed") {
        this.replyToTool(call.call_id, {
          ok: false,
          message:
            "The workflow is not confirmed yet. Update and confirm the diagram first.",
        });
        return;
      }

      const proposal: AutomationProposal = {
        id:
          typeof args.id === "string" && args.id.trim()
            ? args.id.trim()
            : crypto.randomUUID(),
        name:
          typeof args.name === "string" ? args.name.trim() : "Proposed agent",
        outcome:
          typeof args.outcome === "string" ? args.outcome.trim() : "",
        trigger:
          typeof args.trigger === "string" ? args.trigger.trim() : "",
        agentSteps: asStringArray(args.agentSteps),
        humanSteps: asStringArray(args.humanSteps),
        feasibilityNote:
          typeof args.feasibilityNote === "string"
            ? args.feasibilityNote.trim()
            : "",
        status: "proposed",
      };

      this.setArtifacts({
        ...this.artifacts,
        stage: "automation",
        automation: proposal,
        readiness: null,
      });

      this.replyToTool(call.call_id, {
        ok: true,
        message:
          "Automation proposal is visible and replaced the diagram. Wait for explicit confirmation before integrations.",
      });
      return;
    }

    if (call.name === "show_integrations") {
      if (this.artifacts.automation?.status !== "confirmed") {
        this.replyToTool(call.call_id, {
          ok: false,
          message:
            "Wait until the user confirms an automation before showing Connect buttons.",
        });
        return;
      }

      const previous = this.artifacts.integrations;
      const integrations = parseIntegrations(args.integrations).map((item) => {
        const prior = previous.find(
          (p) => p.id === item.id || p.app.toLowerCase() === item.app.toLowerCase(),
        );
        return {
          ...item,
          connected: prior?.connected ?? false,
        };
      });

      this.setArtifacts({
        ...this.artifacts,
        stage: "integrations",
        integrations,
      });

      this.replyToTool(call.call_id, {
        ok: true,
        count: integrations.length,
        message:
          "Connect buttons are visible and replaced the proposal. They are simulated only. Update readiness after the user clicks.",
      });
      return;
    }

    if (call.name === "show_agent_readiness") {
      const readiness: AgentReadiness = {
        agentName:
          typeof args.agentName === "string"
            ? args.agentName.trim()
            : "Prepared agent",
        outcome: typeof args.outcome === "string" ? args.outcome.trim() : "",
        trigger: typeof args.trigger === "string" ? args.trigger.trim() : "",
        requiredIntegrations: asStringArray(args.requiredIntegrations),
        remainingSetup: asStringArray(args.remainingSetup),
        readyToCreate: args.readyToCreate === true,
        statusNote:
          typeof args.statusNote === "string" ? args.statusNote.trim() : "",
        proposedAgentDiagram: parseAgentDiagram(args.proposedAgentDiagram),
      };

      this.setArtifacts({
        ...this.artifacts,
        stage: "readiness",
        readiness,
      });

      this.replyToTool(call.call_id, {
        ok: true,
        readyToCreate: readiness.readyToCreate,
        message:
          "Readiness summary is visible and replaced prior panels. There is no final report.",
      });
      return;
    }

    if (call.name === "request_screen_share") {
      const reason =
        typeof args.reason === "string"
          ? args.reason
          : "Seeing this would help me understand the workflow";
      const whatToShow =
        typeof args.whatToShow === "string" ? args.whatToShow : "";

      if (this.screenStream) {
        this.replyToTool(call.call_id, {
          ok: false,
          message:
            "The user is already sharing their screen. Just ask them to show you.",
        });
        return;
      }

      this.callbacks.onScreenShareRequest?.({ reason, whatToShow });
      this.replyToTool(call.call_id, {
        ok: true,
        message:
          "A Share Screen button is now visible. Wait for them to decide. Do not repeat the request. If they decline, continue on voice.",
      });
      return;
    }

    if (call.name === "suggest_stop_sharing") {
      const message =
        typeof args.message === "string" && args.message.trim()
          ? args.message.trim()
          : "I have enough of that screen. You can stop sharing whenever you like.";

      this.setArtifacts({
        ...this.artifacts,
        stopShareHint: message,
      });

      this.replyToTool(call.call_id, {
        ok: true,
        sharing: Boolean(this.screenStream),
        message: "Stop-sharing hint is visible.",
      });
      return;
    }

    if (call.name === "request_screenshot") {
      const detail = args.detail === "high" ? "high" : "low";
      const reason =
        typeof args.reason === "string" ? args.reason : "Need clearer visual detail";

      void (async () => {
        const frame = await this.captureAndSendFrame({
          forced: true,
          detail,
          triggerResponse: false,
          note: `[Fresh screenshot requested by consultant: ${reason}]`,
        });

        this.replyToTool(call.call_id!, {
          ok: Boolean(frame),
          reason,
          detail,
          message: frame
            ? "Fresh screenshot attached to the conversation."
            : "Screenshot unavailable (screen sharing paused or ended).",
        });
      })();
    }
  }

  private handleServerEvent(event: RealtimeServerEvent) {
    switch (event.type) {
      case "input_audio_buffer.speech_started":
        this.setStatus("listening");
        break;
      case "response.created":
        this.responseInFlight = true;
        if (this.status !== "speaking") {
          this.setStatus("thinking");
        }
        break;
      case "response.output_item.added":
        if (this.status !== "speaking") {
          this.setStatus("thinking");
        }
        break;
      case "response.output_audio.delta":
      case "response.output_audio_transcript.delta":
        this.setStatus("speaking");
        if (event.type === "response.output_audio_transcript.delta" && event.delta) {
          this.assistantBuffer += event.delta;
        }
        break;
      case "response.output_audio_transcript.done":
        if (event.transcript?.trim()) {
          this.emitTranscript("assistant", event.transcript);
        } else if (this.assistantBuffer.trim()) {
          this.emitTranscript("assistant", this.assistantBuffer);
        }
        this.assistantBuffer = "";
        this.setStatus("listening");
        break;
      case "conversation.item.input_audio_transcription.delta":
        if (event.delta) this.userBuffer += event.delta;
        break;
      case "conversation.item.input_audio_transcription.completed":
        this.emitTranscript("user", event.transcript ?? this.userBuffer);
        this.userBuffer = "";
        break;
      case "response.function_call_arguments.done":
        this.setStatus("thinking");
        this.handleToolCall({
          name: event.name,
          call_id: event.call_id,
          arguments: event.arguments,
        });
        break;
      case "response.done": {
        const outputs = event.response?.output ?? [];
        for (const item of outputs) {
          if (item.type === "function_call") {
            this.handleToolCall(item);
          }
        }
        this.finishResponse();
        if (event.response?.status === "completed") {
          this.setStatus("listening");
        }
        break;
      }
      case "error": {
        const message = event.error?.message ?? "Realtime error";
        // Benign race when tools, pacing notes, or UI actions overlap.
        if (message.includes("active response in progress")) {
          this.responseInFlight = true;
          this.responseQueued = true;
          break;
        }
        this.callbacks.onError?.(message);
        this.setStatus("error");
        break;
      }
      default:
        break;
    }
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseWorkflowNodes(value: unknown): WorkflowDiagramNode[] {
  if (!Array.isArray(value)) return [];
  const kinds = new Set([
    "start",
    "action",
    "decision",
    "loop",
    "end",
    "handoff",
  ]);

  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.label !== "string") return [];
    if (typeof item.kind !== "string" || !kinds.has(item.kind)) return [];
    return [
      {
        id: item.id,
        label: item.label,
        kind: item.kind as WorkflowDiagramNode["kind"],
        application:
          typeof item.application === "string" ? item.application : undefined,
        source: normalizeEvidenceSource(item.source),
      },
    ];
  });
}

function parseWorkflowEdges(value: unknown): WorkflowDiagramEdge[] {
  if (!Array.isArray(value)) return [];
  const kinds = new Set(["default", "yes", "no", "loop", "handoff"]);

  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    if (
      typeof item.id !== "string" ||
      typeof item.source !== "string" ||
      typeof item.target !== "string"
    ) {
      return [];
    }
    return [
      {
        id: item.id,
        source: item.source,
        target: item.target,
        label: typeof item.label === "string" ? item.label : undefined,
        kind:
          typeof item.kind === "string" && kinds.has(item.kind)
            ? (item.kind as WorkflowDiagramEdge["kind"])
            : "default",
      },
    ];
  });
}

function parseIntegrations(value: unknown): IntegrationRequirement[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    if (
      typeof item.id !== "string" ||
      typeof item.app !== "string" ||
      typeof item.reason !== "string"
    ) {
      return [];
    }
    return [
      {
        id: item.id,
        app: item.app.trim(),
        reason: item.reason.trim(),
        required: item.required !== false,
        connected: false,
      },
    ];
  });
}

function parseAgentDiagram(value: unknown): AgentDiagram | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return null;

  const nodeKinds = new Set([
    "trigger",
    "agent",
    "decision",
    "verify",
    "human",
    "end",
  ]);
  const edgeKinds = new Set(["default", "yes", "no", "retry", "escalate"]);

  const nodes: AgentDiagramNode[] = raw.nodes.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const node = item as Record<string, unknown>;
    if (
      typeof node.id !== "string" ||
      typeof node.label !== "string" ||
      typeof node.kind !== "string" ||
      !nodeKinds.has(node.kind)
    ) {
      return [];
    }
    return [
      {
        id: node.id,
        label: node.label,
        kind: node.kind as AgentDiagramNode["kind"],
        application:
          typeof node.application === "string" ? node.application : undefined,
      },
    ];
  });

  const edges: AgentDiagramEdge[] = raw.edges.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const edge = item as Record<string, unknown>;
    if (
      typeof edge.id !== "string" ||
      typeof edge.source !== "string" ||
      typeof edge.target !== "string"
    ) {
      return [];
    }
    return [
      {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: typeof edge.label === "string" ? edge.label : undefined,
        kind:
          typeof edge.kind === "string" && edgeKinds.has(edge.kind)
            ? (edge.kind as AgentDiagramEdge["kind"])
            : "default",
      },
    ];
  });

  if (!nodes.length) return null;
  return { nodes, edges };
}
