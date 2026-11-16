import { NextResponse } from "next/server";

import {
  CONSULTANT_INSTRUCTIONS,
  REALTIME_TOOLS,
} from "@/lib/consultant-prompt";

const SESSION_CONFIG = {
  session: {
    type: "realtime" as const,
    model: "gpt-realtime-2.1",
    instructions: CONSULTANT_INSTRUCTIONS,
    tools: REALTIME_TOOLS,
    tool_choice: "auto" as const,
    audio: {
      input: {
        transcription: {
          model: "gpt-4o-mini-transcribe",
        },
      },
      output: {
        voice: "marin",
      },
    },
  },
};

export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Set OPENAI_API_KEY in .env.local" },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": "interview-test-workflow-consultant",
        },
        body: JSON.stringify(SESSION_CONFIG),
      },
    );

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error?.message ?? "Failed to create client secret" },
        { status: response.status },
      );
    }

    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Realtime token error:", error);
    return NextResponse.json(
      { error: "Failed to create client secret" },
      { status: 500 },
    );
  }
}
