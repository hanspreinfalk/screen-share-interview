import {
  framesAreSimilar,
  ScreenFrameCapture,
  type CapturedFrame,
} from "@/lib/frame-capture";
import type { RealtimeStatus, TranscriptLine } from "@/lib/session-types";
import {
  createEmptyWorkflowModel,
  mergeWorkflowModel,
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
  onFrameSent?: (info: { fingerprint: string; forced: boolean }) => void;
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
  private frameCapture = new ScreenFrameCapture();
  private screenStream: MediaStream | null = null;
  private frameTimer: ReturnType<typeof setInterval> | null = null;
  private lastFingerprint: string | null = null;
  private screenPaused = false;
  private micMuted = false;
  private sendingFrame = false;
  private startedAt = 0;
  private handledToolCalls = new Set<string>();
  private status: RealtimeStatus = "idle";

  constructor(private readonly callbacks: RealtimeSessionCallbacks = {}) {}

  getWorkflowModel() {
    return this.workflowModel;
  }

  getScreenStream() {
    return this.screenStream;
  }

  isMicMuted() {
    return this.micMuted;
  }

  isScreenPaused() {
    return this.screenPaused;
  }

  private setStatus(status: RealtimeStatus) {
    this.status = status;
    this.callbacks.onStatus?.(status);
  }

  async start(options?: { withScreen?: boolean }) {
    this.setStatus("connecting");
    this.workflowModel = createEmptyWorkflowModel();
    this.callbacks.onWorkflowUpdate?.(this.workflowModel);
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
      audio.srcObject = event.streams[0];
    };

    const micTrack = mic.getAudioTracks()[0];
    const micSender = pc.addTrack(micTrack, mic);

    const dc = pc.createDataChannel("oai-events");
    dc.addEventListener("open", () => {
      this.setStatus("listening");
      dc.send(JSON.stringify({ type: "response.create" }));
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
      this.sendEvent({ type: "response.create" });
    }
    return sent;
  }

  setMicMuted(muted: boolean) {
    this.micMuted = muted;
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
    this.callbacks.onScreenState?.({
      sharing: false,
      paused: false,
      viewing: false,
    });

    if (wasSharing && options?.notifyModel) {
      this.notifyModel(
        "[The user stopped sharing their screen. Acknowledge briefly if natural and continue on voice. Do not ask them to share again.]",
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
        this.sendEvent({ type: "response.create" });
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

      this.sendEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify({ ok: true, updatedAt: this.workflowModel.updatedAt }),
        },
      });
      this.sendEvent({ type: "response.create" });
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
        // Already sharing; nothing to ask for.
        this.sendEvent({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify({
              ok: false,
              message:
                "The user is already sharing their screen. Just ask them to show you.",
            }),
          },
        });
        this.sendEvent({ type: "response.create" });
        return;
      }

      this.callbacks.onScreenShareRequest?.({ reason, whatToShow });

      this.sendEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify({
            ok: true,
            message:
              "A Share Screen button is now visible. Wait for them to decide. Do not repeat the request. If they decline, continue on voice.",
          }),
        },
      });
      this.sendEvent({ type: "response.create" });
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

        this.sendEvent({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify({
              ok: Boolean(frame),
              reason,
              detail,
              message: frame
                ? "Fresh screenshot attached to the conversation."
                : "Screenshot unavailable (screen sharing paused or ended).",
            }),
          },
        });
        this.sendEvent({ type: "response.create" });
      })();
    }
  }

  private handleServerEvent(event: RealtimeServerEvent) {
    switch (event.type) {
      case "input_audio_buffer.speech_started":
        this.setStatus("listening");
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
        if (event.response?.status === "completed") {
          this.setStatus("listening");
        }
        break;
      }
      case "error":
        this.callbacks.onError?.(event.error?.message ?? "Realtime error");
        this.setStatus("error");
        break;
      default:
        break;
    }
  }
}
