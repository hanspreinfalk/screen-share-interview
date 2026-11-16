import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

function headerGet(headers: Headers, name: string): string | null {
  return headers.get(name) ?? headers.get(name.toLowerCase());
}

async function verifyComposioSignature(
  rawBody: string,
  headers: Headers,
  secret: string,
): Promise<boolean> {
  const signatureHeader = headerGet(headers, "webhook-signature");
  const webhookId = headerGet(headers, "webhook-id");
  const webhookTimestamp = headerGet(headers, "webhook-timestamp");
  if (!signatureHeader || !webhookId || !webhookTimestamp) {
    return false;
  }

  // Svix-style secrets are often `whsec_<base64>`.
  const keyBytes = secret.startsWith("whsec_")
    ? Uint8Array.from(atob(secret.slice("whsec_".length)), (c) =>
        c.charCodeAt(0),
      )
    : new TextEncoder().encode(secret);

  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(signedContent),
  );
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  const candidates = signatureHeader.split(" ").flatMap((part) => {
    const [, value] = part.split(",", 2);
    return value ? [value] : [];
  });

  return candidates.some((candidate) => candidate === expected);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

http.route({
  path: "/composio/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const rawBody = await req.text();

    // Fail closed: without a configured secret we cannot prove the caller is
    // Composio, and the payload names the user whose automations would run.
    const secret = process.env.COMPOSIO_WEBHOOK_SECRET;
    if (!secret) {
      return new Response("Webhook secret is not configured", { status: 503 });
    }
    const ok = await verifyComposioSignature(rawBody, req.headers, secret);
    if (!ok) {
      return new Response("Invalid webhook signature", { status: 401 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody) as unknown;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const body = asRecord(parsed);
    if (!body) {
      return new Response("Expected JSON object", { status: 400 });
    }

    // Support V3-normalized and raw nested shapes.
    const data = asRecord(body.data) ?? body;
    const metadata = asRecord(data.metadata) ?? asRecord(body.metadata);
    const connectedAccount = asRecord(metadata?.connectedAccount);

    const triggerSlug = pickString(
      data.triggerSlug,
      body.triggerSlug,
      metadata?.triggerSlug,
    );
    const composioTriggerId = pickString(
      metadata?.id,
      data.triggerId,
      body.triggerId,
      body.id,
    );
    const clerkId = pickString(
      data.userId,
      body.userId,
      connectedAccount?.userId,
      metadata?.userId,
    );
    const eventId = pickString(
      data.id,
      data.uuid,
      body.id,
      body.uuid,
      body.eventId,
    );

    if (!clerkId) {
      return new Response("Missing userId in webhook payload", { status: 400 });
    }

    const automation = await ctx.runQuery(
      internal.automationEngine.findAutomationForEvent,
      {
        clerkId,
        composioTriggerId,
        triggerSlug,
      },
    );

    if (!automation) {
      // Acknowledge so Composio does not retry forever for unmatched events.
      return new Response(JSON.stringify({ ok: true, matched: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // A stable fallback key would dedupe every future firing of the same
    // trigger into one execution, so fall back to the delivery timestamp.
    const deliveryId =
      eventId ??
      req.headers.get("webhook-id") ??
      `${composioTriggerId ?? triggerSlug ?? "event"}:${Date.now()}`;
    const idempotencyKey = `event:${deliveryId}:${automation._id}`;

    const executionId = await ctx.runMutation(
      internal.automationEngine.enqueueRun,
      {
        automationId: automation._id,
        userId: automation.userId,
        triggerSource: "event",
        idempotencyKey,
        input: {
          triggerSlug,
          composioTriggerId,
          payload: data.payload ?? body.payload ?? body,
        },
        composioEventId: eventId,
        scheduleStart: true,
      },
    );

    return new Response(
      JSON.stringify({ ok: true, matched: true, executionId }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }),
});

export default http;
