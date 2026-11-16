export type RealtimeStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "paused"
  | "error";

export type TranscriptLine = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  at: string;
};
