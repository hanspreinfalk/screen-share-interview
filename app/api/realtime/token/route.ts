import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { buildFriendInstructions } from "@/lib/friend-prompt";

const REALTIME_MODEL = "gpt-realtime-2";
const DEFAULT_VOICE = "marin";

/**
 * Mint a short-lived OpenAI Realtime client secret for the browser.
 * Session is locked to the realtime model and the Pacific friend prompt.
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  // Per-call context (name, local time) so the opener varies and feels known.
  // Body is optional; a malformed one must not break the call.
  let context: { firstName?: string | null; localTime?: string | null } = {};
  try {
    const body = await request.json();
    if (body && typeof body === "object") {
      const { firstName, localTime } = body as Record<string, unknown>;
      context = {
        firstName: typeof firstName === "string" ? firstName.slice(0, 64) : null,
        localTime: typeof localTime === "string" ? localTime.slice(0, 64) : null,
      };
    }
  } catch {
    /* no body sent; fall back to the base prompt */
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Set OPENAI_API_KEY in .env.local" },
      { status: 503 },
    );
  }

  const voice = process.env.OPENAI_REALTIME_VOICE || DEFAULT_VOICE;

  try {
    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session: {
            type: "realtime",
            model: REALTIME_MODEL,
            instructions: buildFriendInstructions(context),
            output_modalities: ["audio"],
            audio: {
              input: {
                // WebRTC negotiates Opus media tracks; no PCM format here.
                // Filters the mic before VAD, which cuts false turn triggers
                // from background noise (a big source of weird interruptions).
                noise_reduction: { type: "near_field" },
                transcription: { model: "gpt-4o-mini-transcribe" },
                turn_detection: {
                  // semantic_vad reads meaning to tell when a thought is
                  // actually finished, instead of just timing silence.
                  type: "semantic_vad",
                  // high = reply sooner (max ~2s wait vs ~4s on medium)
                  eagerness: "high",
                  create_response: true,
                  interrupt_response: true,
                },
              },
              output: {
                voice,
                // Natural playback rate. Delivery/pacing is steered in the prompt.
                speed: 1,
              },
            },
          },
          expires_after: { anchor: "created_at", seconds: 600 },
        }),
      },
    );

    const data = (await response.json()) as {
      value?: string;
      error?: { message?: string };
      message?: string;
    };

    if (!response.ok || !data.value) {
      const detail =
        data.error?.message ?? data.message ?? "Failed to create Realtime client secret";
      return NextResponse.json({ error: detail }, { status: response.status });
    }

    return NextResponse.json(
      { value: data.value },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("OpenAI Realtime token error:", error);
    return NextResponse.json(
      { error: "Failed to create Realtime client secret" },
      { status: 500 },
    );
  }
}
