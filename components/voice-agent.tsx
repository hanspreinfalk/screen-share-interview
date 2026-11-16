"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  RealtimeVoiceSession,
  type RealtimeStatus,
  type TranscriptLine,
} from "@/lib/realtime-session";
import { cn } from "@/lib/utils";

function statusLabel(status: RealtimeStatus) {
  switch (status) {
    case "connecting":
      return "Connecting…";
    case "listening":
      return "Listening — speak anytime";
    case "speaking":
      return "Assistant speaking";
    case "error":
      return "Something went wrong";
    default:
      return "Press to talk";
  }
}

export function VoiceAgent() {
  const sessionRef = useRef<RealtimeVoiceSession | null>(null);
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const active = status === "connecting" || status === "listening" || status === "speaking";

  useEffect(() => {
    return () => {
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, []);

  async function toggle() {
    if (active) {
      sessionRef.current?.stop();
      sessionRef.current = null;
      setStatus("idle");
      return;
    }

    setError(null);
    setTranscript([]);
    const session = new RealtimeVoiceSession({
      onStatus: setStatus,
      onTranscript: (line) => setTranscript((prev) => [...prev, line]),
      onError: setError,
    });
    sessionRef.current = session;

    try {
      await session.start();
    } catch (err) {
      session.stop();
      sessionRef.current = null;
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not start voice session");
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Button
          type="button"
          size="lg"
          variant={active ? "destructive" : "default"}
          onClick={toggle}
          disabled={status === "connecting"}
          className={cn(
            "h-14 min-w-44 gap-2 rounded-lg px-6 text-sm",
            active && "bg-destructive text-white hover:bg-destructive/90",
          )}
        >
          {active ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          {active ? "End call" : "Talk"}
        </Button>
        <p className="text-sm text-muted-foreground">{statusLabel(status)}</p>
        {error ? (
          <p className="max-w-sm text-sm text-destructive">{error}</p>
        ) : null}
      </div>

      {transcript.length > 0 ? (
        <div className="w-full space-y-3 rounded-xl border border-border bg-card p-4 text-left">
          {transcript.map((line) => (
            <div key={line.id} className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {line.role === "user" ? "You" : "Assistant"}
              </p>
              <p className="text-sm leading-relaxed text-foreground">{line.text}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
