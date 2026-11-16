export type RealtimeStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "speaking"
  | "error";

export type TranscriptLine = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  at: string;
};
