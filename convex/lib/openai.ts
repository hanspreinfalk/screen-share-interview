/**
 * Minimal OpenAI JSON helper for server-side reasoning inside Convex actions.
 *
 * Two jobs only:
 *  - turn a plain-language step instruction into a REAL structured payload for
 *    a specific Composio tool, using that tool's own input schema
 *  - judge honestly whether a finished run actually achieved the goal
 *
 * Both are deliberately small and schema-constrained: no free-form prose is
 * ever trusted, and a failure here must surface as a failed run rather than a
 * silent success.
 */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4.1";

function requireOpenAiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is not set on the Convex deployment, so automation steps cannot be planned",
    );
  }
  return key;
}

type JsonObject = Record<string, unknown>;

async function callOpenAi(body: JsonObject): Promise<string> {
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireOpenAiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, ...body }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${detail.slice(0, 400)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned an empty response");
  }
  return content;
}

function parseJsonObject(text: string): JsonObject {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed as JsonObject;
  } catch {
    throw new Error("Model did not return valid JSON");
  }
}

/**
 * Build the concrete arguments for one Composio tool call.
 *
 * The tool's own JSON schema is the contract, so the model fills that schema
 * instead of inventing fields. When a required value genuinely is not
 * available, it must say so rather than fabricate one: a wrong recipient or a
 * made-up spreadsheet id is far worse than an honest failure.
 */
export async function synthesizeToolArgs(params: {
  toolSlug: string;
  toolName?: string;
  toolDescription?: string;
  inputSchema: JsonObject | null;
  instruction: string;
  automationName: string;
  automationDescription: string;
  businessRules: string[];
  runInput: unknown;
  previousSteps: Array<{ title: string; summary?: string; result?: unknown }>;
}): Promise<
  | { ok: true; args: JsonObject; note: string }
  | { ok: false; missing: string[]; reason: string }
> {
  const schemaText = params.inputSchema
    ? JSON.stringify(params.inputSchema).slice(0, 12_000)
    : "(schema unavailable)";

  const context = {
    automation: {
      name: params.automationName,
      goal: params.automationDescription,
      rules: params.businessRules,
    },
    thisStep: params.instruction,
    runInput: params.runInput ?? null,
    previousSteps: params.previousSteps.slice(-4).map((step) => ({
      step: step.title,
      outcome: step.summary ?? null,
      data: truncateForPrompt(step.result),
    })),
  };

  const content = await callOpenAi({
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "You convert one plain-language automation step into the exact arguments for one specific API tool.",
          "",
          "Rules:",
          "1. Output ONLY arguments that exist in the tool's input schema. Never invent parameter names.",
          "2. Satisfy every required parameter. Use the run input and previous step results as the source of truth.",
          "3. Never fabricate identifiers, addresses, recipients, channel names, ids, or URLs. If a required value is not derivable, report it as missing.",
          "4. Prefer values the user actually provided over plausible-sounding defaults.",
          "5. Respond with JSON: {\"ok\": true, \"args\": {...}, \"note\": \"one short line\"} or {\"ok\": false, \"missing\": [\"param\"], \"reason\": \"one short line\"}.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Tool slug: ${params.toolSlug}`,
          params.toolName ? `Tool name: ${params.toolName}` : "",
          params.toolDescription
            ? `Tool description: ${params.toolDescription.slice(0, 600)}`
            : "",
          `Tool input schema: ${schemaText}`,
          `Context: ${JSON.stringify(context).slice(0, 8_000)}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  const parsed = parseJsonObject(content);
  if (parsed.ok === true && parsed.args && typeof parsed.args === "object") {
    return {
      ok: true,
      args: parsed.args as JsonObject,
      note: typeof parsed.note === "string" ? parsed.note : "",
    };
  }

  const missing = Array.isArray(parsed.missing)
    ? parsed.missing.filter((item): item is string => typeof item === "string")
    : [];
  return {
    ok: false,
    missing,
    reason:
      typeof parsed.reason === "string" && parsed.reason.trim()
        ? parsed.reason.trim()
        : "Required information for this step was not available",
  };
}

/**
 * Judge whether the run actually achieved its goal.
 *
 * Deliberately skeptical: a tool call that returned 200 with an empty result,
 * or a run where every step was skipped, is NOT a success. Pacific must never
 * tell a user an automation works when it did nothing.
 */
export async function verifyRunOutcome(params: {
  automationName: string;
  goal: string;
  verificationCriteria: string[];
  steps: Array<{
    title: string;
    toolSlug?: string;
    status: string;
    summary?: string;
    error?: string;
    result?: unknown;
  }>;
}): Promise<{ verified: boolean; summary: string; issues: string[] }> {
  const content = await callOpenAi({
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "You verify whether an automation run genuinely achieved its goal, based only on the recorded step evidence.",
          "",
          "Be strict and honest:",
          "- Any step that failed or was skipped means verified is false.",
          "- A tool response with no evidence the action occurred means verified is false.",
          "- Empty results, zero records touched, or missing identifiers mean verified is false.",
          "- Only set verified true when the evidence shows the real outcome happened.",
          "",
          "Write summary as one short sentence a non-technical user understands. No jargon, no em dashes.",
          "Respond with JSON: {\"verified\": boolean, \"summary\": string, \"issues\": string[]}.",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          automation: params.automationName,
          goal: params.goal,
          successCriteria: params.verificationCriteria,
          steps: params.steps.map((step) => ({
            step: step.title,
            tool: step.toolSlug ?? null,
            status: step.status,
            outcome: step.summary ?? null,
            error: step.error ?? null,
            evidence: truncateForPrompt(step.result),
          })),
        }).slice(0, 12_000),
      },
    ],
  });

  const parsed = parseJsonObject(content);
  return {
    verified: parsed.verified === true,
    summary:
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : "Could not determine whether the run achieved its goal",
    issues: Array.isArray(parsed.issues)
      ? parsed.issues.filter((item): item is string => typeof item === "string")
      : [],
  };
}

/** Keep tool payloads small enough to reason over without losing the signal. */
export function truncateForPrompt(value: unknown, max = 1_500): unknown {
  if (value === undefined || value === null) return null;
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    return "(unserializable)";
  }
  if (text.length <= max) {
    return JSON.parse(text) as unknown;
  }
  return `${text.slice(0, max)}… (truncated)`;
}
