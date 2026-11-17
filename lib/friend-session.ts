import type { RealtimeStatus, TranscriptLine } from "@/lib/session-types";

type RealtimeServerEvent = {
  type?: string;
  delta?: string;
  transcript?: string;
  error?: { message?: string } | string;
};

export type FriendSessionCallbacks = {
  onStatus?: (status: RealtimeStatus) => void;
  onTranscript?: (line: TranscriptLine) => void;
  onError?: (message: string) => void;
  onRemoteStream?: (stream: MediaStream) => void;
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

/**
 * OpenAI Realtime over WebRTC.
 * WebRTC keeps mic/playback on native media tracks, so turns feel instant.
 * Model, voice, and turn detection are configured server-side when the
 * ephemeral client secret is minted (see app/api/realtime/token/route.ts).
 */
export class FriendVoiceSession {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private remoteStream: MediaStream | null = null;
  private assistantBuffer = "";
  private userBuffer = "";
  private micMuted = false;
  private callPaused = false;
  private status: RealtimeStatus = "idle";
  private responseInFlight = false;
  private responseQueued = false;
  private greetingStarted = false;

  constructor(private readonly callbacks: FriendSessionCallbacks = {}) {}

  getMicStream() {
    return this.mic;
  }

  getRemoteStream() {
    return this.remoteStream;
  }

  isMicMuted() {
    return this.micMuted;
  }

  isCallPaused() {
    return this.callPaused;
  }

  private setStatus(status: RealtimeStatus) {
    if (
      this.callPaused &&
      status !== "paused" &&
      status !== "idle" &&
      status !== "error"
    ) {
      return;
    }
    this.status = status;
    this.callbacks.onStatus?.(status);
  }

  private sendEvent(payload: unknown) {
    if (!this.dc || this.dc.readyState !== "open") return false;
    this.dc.send(JSON.stringify(payload));
    return true;
  }

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
   * Opening line. Sent as an out-of-band response (`input: []`) so no fake
   * "[the call just connected]" user turn ends up in the conversation, where
   * the model would treat the stage direction as something the person said.
   *
   * Deliberately no `response.instructions`: that field REPLACES the session
   * instructions for the response, which would drop the whole Pacific persona
   * and produce an assistant-style "how can I help you today" opener. The
   * greeting wording comes from the prompt's Conversation Flow / Greeting
   * section instead.
   */
  private startGreeting() {
    if (this.greetingStarted) return;
    this.greetingStarted = true;
    this.setStatus("thinking");
    const sent = this.sendEvent({
      type: "response.create",
      response: { input: [] },
    });
    if (sent) this.responseInFlight = true;
    else this.greetingStarted = false;
  }

  setMicMuted(muted: boolean) {
    this.micMuted = muted;
    this.mic?.getAudioTracks().forEach((track) => {
      track.enabled = !muted && !this.callPaused;
    });
  }

  setCallPaused(paused: boolean) {
    this.callPaused = paused;
    this.mic?.getAudioTracks().forEach((track) => {
      track.enabled = !paused && !this.micMuted;
    });
    if (this.audioEl) this.audioEl.muted = paused;

    if (paused) {
      this.setStatus("paused");
      this.notifyModel(
        "[The user paused the call. Wait silently. Do not speak until they resume.]",
      );
    } else {
      this.setStatus("listening");
      this.notifyModel("[The user resumed the call. Continue naturally.]", {
        triggerResponse: true,
      });
    }
  }

  notifyModel(text: string, options?: { triggerResponse?: boolean }) {
    const sent = this.sendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    });
    if (sent && options?.triggerResponse) this.requestResponse();
    return sent;
  }

  async start(context?: { firstName?: string | null }) {
    this.setStatus("connecting");

    const tokenResponse = await fetch("/api/realtime/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: context?.firstName ?? null,
        localTime: new Date().toLocaleString(undefined, {
          weekday: "long",
          hour: "numeric",
          minute: "2-digit",
        }),
      }),
    });
    const tokenPayload = await tokenResponse.json();
    if (!tokenResponse.ok) {
      throw new Error(tokenPayload.error ?? "Could not create session token");
    }
    const ephemeralKey = tokenPayload.value as string | undefined;
    if (!ephemeralKey) throw new Error("Missing ephemeral client secret");

    let mic: MediaStream;
    try {
      // Explicit AEC/NS/AGC — required so speakers don't feed Marin back into
      // the mic (that loop is what sounds like an echo).
      mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          channelCount: { ideal: 1 },
        },
      });
      await Promise.all(
        mic.getAudioTracks().map((track) =>
          track
            .applyConstraints({
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            })
            .catch(() => undefined),
        ),
      );
    } catch (error) {
      throw new Error(
        error instanceof Error && error.name === "NotAllowedError"
          ? "Microphone permission was denied"
          : "Could not access microphone",
      );
    }

    const pc = new RTCPeerConnection();
    // Keep the element in the DOM. Detached <audio> playback often breaks the
    // browser's echo canceller, so speaker output leaks back into the mic.
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.setAttribute("playsinline", "true");
    audio.style.display = "none";
    document.body.appendChild(audio);

    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      this.remoteStream = stream;
      audio.srcObject = stream;
      void audio.play().catch(() => {
        /* autoplay may need a gesture; the Talk click counts */
      });
      this.callbacks.onRemoteStream?.(stream);
    };

    const micTrack = mic.getAudioTracks()[0];
    if (micTrack) pc.addTrack(micTrack, mic);

    const dc = pc.createDataChannel("oai-events");
    dc.addEventListener("open", () => {
      this.responseInFlight = false;
      this.responseQueued = false;
      // Greeting waits for `session.created` so the prompt and audio config
      // are live before the first response is generated.
    });
    dc.addEventListener("message", (event) => {
      try {
        this.handleServerEvent(
          JSON.parse(String(event.data)) as RealtimeServerEvent,
        );
      } catch {
        this.callbacks.onError?.("Failed to parse Realtime event");
      }
    });

    pc.addEventListener("connectionstatechange", () => {
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected"
      ) {
        this.callbacks.onError?.("Connection dropped.");
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
      pc.close();
      const detail = await sdpResponse.text();
      throw new Error(detail || "WebRTC handshake failed");
    }

    await pc.setRemoteDescription({
      type: "answer",
      sdp: await sdpResponse.text(),
    });

    this.pc = pc;
    this.dc = dc;
    this.mic = mic;
    this.audioEl = audio;
    this.micMuted = false;
    this.callPaused = false;
    // Do NOT reset greetingStarted here: `session.created` can arrive on the
    // data channel before this line runs, and resetting would let a later
    // `session.updated` fire a second greeting.
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

  private handleServerEvent(event: RealtimeServerEvent) {
    switch (event.type) {
      case "session.created":
      case "session.updated":
        this.startGreeting();
        break;
      case "response.created":
        this.responseInFlight = true;
        this.setStatus("thinking");
        break;
      case "response.output_audio.delta":
      case "response.audio.delta":
        this.setStatus("speaking");
        break;
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta":
        if (typeof event.delta === "string") this.assistantBuffer += event.delta;
        this.setStatus("speaking");
        break;
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done":
        if (this.assistantBuffer.trim()) {
          this.emitTranscript("assistant", this.assistantBuffer);
        }
        this.assistantBuffer = "";
        break;
      case "conversation.item.input_audio_transcription.delta":
        if (typeof event.delta === "string") this.userBuffer += event.delta;
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (typeof event.transcript === "string") {
          this.emitTranscript("user", event.transcript);
        } else if (this.userBuffer.trim()) {
          this.emitTranscript("user", this.userBuffer);
        }
        this.userBuffer = "";
        break;
      case "input_audio_buffer.speech_started":
        this.setStatus("listening");
        break;
      case "response.done":
      case "response.completed":
        this.finishResponse();
        if (!this.callPaused) this.setStatus("listening");
        break;
      case "error": {
        const message =
          typeof event.error === "string"
            ? event.error
            : event.error?.message ?? "Realtime error";
        this.callbacks.onError?.(message);
        this.finishResponse();
        this.setStatus("error");
        break;
      }
      default:
        break;
    }
  }

  stop() {
    this.assistantBuffer = "";
    this.userBuffer = "";
    this.micMuted = false;
    this.callPaused = false;
    this.responseInFlight = false;
    this.responseQueued = false;
    this.greetingStarted = false;
    this.remoteStream = null;

    try {
      this.dc?.close();
    } catch {
      /* ignore */
    }
    this.dc = null;

    this.mic?.getTracks().forEach((track) => track.stop());
    this.mic = null;

    if (this.audioEl) {
      this.audioEl.srcObject = null;
      this.audioEl.pause();
      this.audioEl.remove();
      this.audioEl = null;
    }

    try {
      this.pc?.close();
    } catch {
      /* ignore */
    }
    this.pc = null;

    this.setStatus("idle");
  }
}
