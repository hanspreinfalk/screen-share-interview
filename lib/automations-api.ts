import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";

/**
 * Typed handles for the automations module.
 *
 * This used to be a string-reference fallback layer that erased inference and
 * forced casts at every call site. Codegen covers the module, so these are
 * plain re-exports and call sites keep full type safety.
 */
export const automationsApi = {
  list: api.automations.list,
  get: api.automations.get,
  listExecutions: api.automations.listExecutions,
  getExecution: api.automations.getExecution,
  run: api.automations.run,
  approveStep: api.automations.approveStep,
  setStatus: api.automations.setStatus,
  remove: api.automations.remove,
  configureTrigger: api.automations.configureTrigger,
} as const;

export type AutomationSummary = Doc<"automations">;
export type AutomationDetail = Doc<"automations">;
export type AutomationExecution = Doc<"executions">;

/** Which single primary action a card should offer for this automation. */
export function resolvePrimaryAction(
  item: Pick<AutomationSummary, "status">,
): "run" | "continue" | "view" {
  const status = (item.status ?? "").toLowerCase();
  if (status === "draft") return "continue";
  if (status === "paused") return "view";
  return "run";
}
