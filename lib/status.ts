import type { StatusTone } from "@/components/pacific/primitives";

/** Automation lifecycle status, as the user should understand it. */
export function automationStatusLabel(status: string): {
  label: string;
  tone: StatusTone;
} {
  switch (status) {
    case "active":
      return { label: "Active", tone: "good" };
    case "needs_testing":
      return { label: "Needs testing", tone: "warn" };
    case "paused":
      return { label: "Paused", tone: "neutral" };
    case "failed":
      return { label: "Failed", tone: "danger" };
    case "draft":
    default:
      return { label: "Draft", tone: "neutral" };
  }
}

/** Execution status, plus whether the run was actually verified. */
export function executionStatusLabel(
  status: string,
  verified?: boolean,
): { label: string; tone: StatusTone } {
  switch (status) {
    case "succeeded":
      // Only a checked run earns "Worked". Completed-but-unchecked is not a
      // success claim, and a failed check is a warning.
      if (verified === true) return { label: "Worked", tone: "good" };
      if (verified === false) return { label: "Unverified", tone: "warn" };
      return { label: "Completed", tone: "neutral" };
    case "running":
      return { label: "Running", tone: "active" };
    case "queued":
      return { label: "Queued", tone: "neutral" };
    case "awaiting_approval":
      return { label: "Needs approval", tone: "warn" };
    case "failed":
      return { label: "Failed", tone: "danger" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
    default:
      return { label: status, tone: "neutral" };
  }
}

export function stepStatusLabel(status: string): {
  label: string;
  tone: StatusTone;
} {
  switch (status) {
    case "succeeded":
      return { label: "Done", tone: "good" };
    case "running":
      return { label: "Running", tone: "active" };
    case "failed":
      return { label: "Failed", tone: "danger" };
    case "awaiting_approval":
      return { label: "Needs approval", tone: "warn" };
    case "approved":
      return { label: "Approved", tone: "good" };
    case "skipped":
      return { label: "Skipped", tone: "neutral" };
    case "pending":
    default:
      return { label: "Pending", tone: "neutral" };
  }
}

export function connectionStatusLabel(
  status: string,
  isDisabled?: boolean,
): { label: string; tone: StatusTone } {
  if (isDisabled) return { label: "Disabled", tone: "neutral" };
  if (status === "ACTIVE") return { label: "Connected", tone: "good" };
  if (status === "EXPIRED") return { label: "Expired", tone: "warn" };
  if (status === "FAILED" || status === "REVOKED") {
    return { label: "Needs reconnect", tone: "danger" };
  }
  return { label: "Pending", tone: "warn" };
}

/** Human trigger description, used on cards and detail headers. */
export function triggerSummary(trigger: {
  types: string[];
  schedule?: Record<string, unknown> | null;
}): string {
  const parts: string[] = [];
  if (trigger.types.includes("scheduled")) {
    const schedule = trigger.schedule;
    const frequency =
      typeof schedule?.frequency === "string" ? schedule.frequency : undefined;
    const time =
      typeof schedule?.timeLocal === "string" ? schedule.timeLocal : undefined;
    parts.push(
      frequency && time
        ? `${frequency} at ${time}`
        : frequency
          ? frequency
          : "On a schedule",
    );
  }
  if (trigger.types.includes("event")) parts.push("When an app event fires");
  if (trigger.types.includes("on_demand")) parts.push("When you run it");
  return parts.join(" · ") || "No trigger yet";
}

export function formatRelative(ms?: number | null): string {
  if (!ms) return "Never";
  const diff = Date.now() - ms;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(new Date(ms));
  } catch {
    return "Earlier";
  }
}

export function formatDateTime(ms?: number | null): string {
  if (!ms) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(ms));
  } catch {
    return "—";
  }
}
