"use client";

import { useAction, useMutation } from "convex/react";
import { useState } from "react";

import { ErrorNote } from "@/components/pacific/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toolkitDisplayName } from "@/lib/toolkit";
import { cn } from "@/lib/utils";

type TriggerType = "on_demand" | "scheduled" | "event";

type Trigger = {
  types: TriggerType[];
  schedule?: {
    frequency?: "daily" | "weekly" | "monthly" | "custom";
    timeLocal?: string;
    timezone?: string;
    daysOfWeek?: number[];
    dayOfMonth?: number;
    cron?: string;
    nextRunAt?: number;
  };
  event?: {
    triggerSlug: string;
    toolkit: string;
    triggerConfig: unknown;
    composioTriggerId?: string;
    enabled: boolean;
  };
};

const TYPE_OPTIONS: Array<{ id: TriggerType; label: string; hint: string }> = [
  { id: "on_demand", label: "On demand", hint: "You press Run" },
  { id: "scheduled", label: "Schedule", hint: "At a set time" },
  { id: "event", label: "App event", hint: "When something happens" },
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const fieldClass =
  "mt-1.5 w-full rounded-xl border border-[var(--pr-line)] bg-white px-3 py-2 text-[13px] text-[var(--pr-ink)] outline-none transition-colors focus:border-[var(--pr-ink)]/25";

export function TriggerEditor({
  automationId,
  trigger,
  toolkits,
}: {
  automationId: Id<"automations">;
  trigger: Trigger;
  toolkits: string[];
}) {
  const configureTrigger = useMutation(api.automations.configureTrigger);
  const createEventTrigger = useAction(api.composio.createEventTrigger);
  const disableEventTrigger = useAction(api.composio.disableEventTrigger);
  const discoverTriggers = useAction(api.composio.discoverTriggers);

  const [types, setTypes] = useState<TriggerType[]>(trigger.types);
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">(
    trigger.schedule?.frequency === "weekly" ||
      trigger.schedule?.frequency === "monthly"
      ? trigger.schedule.frequency
      : "daily",
  );
  const [timeLocal, setTimeLocal] = useState(
    trigger.schedule?.timeLocal ?? "09:00",
  );
  const [timezone] = useState(
    trigger.schedule?.timezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  // Previously dropped on save, which silently made the schedule depend on
  // the day you happened to click Save.
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    trigger.schedule?.daysOfWeek ?? [1],
  );
  const [dayOfMonth, setDayOfMonth] = useState(
    trigger.schedule?.dayOfMonth ?? 1,
  );

  const [eventSlug, setEventSlug] = useState(trigger.event?.triggerSlug ?? "");
  const [eventToolkit, setEventToolkit] = useState(
    trigger.event?.toolkit ?? toolkits[0] ?? "",
  );
  const [available, setAvailable] = useState<
    Array<{ slug: string; name: string; toolkit?: string }>
  >([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const hasScheduled = types.includes("scheduled");
  const hasEvent = types.includes("event");

  function toggleType(id: TriggerType) {
    setSaved(false);
    setTypes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  }

  async function loadTriggers() {
    if (!eventToolkit) return;
    setLoadingEvents(true);
    setError(null);
    try {
      const items = await discoverTriggers({ toolkits: [eventToolkit] });
      setAvailable(items);
      if (!eventSlug && items[0]) setEventSlug(items[0].slug);
      if (items.length === 0) {
        setError(`${toolkitDisplayName(eventToolkit)} has no event triggers`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load events");
    } finally {
      setLoadingEvents(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const nextTypes: TriggerType[] = types.length ? types : ["on_demand"];
      let event = trigger.event;

      if (nextTypes.includes("event")) {
        if (!eventSlug || !eventToolkit) {
          throw new Error("Pick an app and an event first");
        }
        if (!event?.composioTriggerId || event.triggerSlug !== eventSlug) {
          if (event?.composioTriggerId) {
            await disableEventTrigger({
              composioTriggerId: event.composioTriggerId,
            });
          }
          const created = await createEventTrigger({
            triggerSlug: eventSlug,
            triggerConfig: {},
          });
          event = {
            triggerSlug: eventSlug,
            toolkit: eventToolkit,
            triggerConfig: {},
            composioTriggerId: created.triggerId,
            enabled: true,
          };
        } else {
          event = { ...event, enabled: true };
        }
      } else if (event?.composioTriggerId) {
        await disableEventTrigger({
          composioTriggerId: event.composioTriggerId,
        });
        event = { ...event, enabled: false };
      }

      await configureTrigger({
        id: automationId,
        trigger: {
          types: nextTypes,
          schedule: nextTypes.includes("scheduled")
            ? {
                frequency,
                timeLocal,
                timezone,
                ...(frequency === "weekly" ? { daysOfWeek } : {}),
                ...(frequency === "monthly" ? { dayOfMonth } : {}),
              }
            : undefined,
          event: nextTypes.includes("event") ? event : undefined,
        },
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save trigger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 rounded-2xl border border-[var(--pr-line)] bg-white p-5">
      <div className="grid gap-2 sm:grid-cols-3">
        {TYPE_OPTIONS.map((option) => {
          const active = types.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => toggleType(option.id)}
              className={cn(
                "rounded-xl border px-3.5 py-3 text-left transition-colors",
                active
                  ? "border-[var(--pr-ink)]/25 bg-[var(--pr-ink)]/[0.035]"
                  : "border-[var(--pr-line)] hover:bg-[var(--pr-ink)]/[0.02]",
              )}
            >
              <span className="block text-[13.5px] text-[var(--pr-ink)]">
                {option.label}
              </span>
              <span className="mt-0.5 block text-[11.5px] text-[var(--pr-muted)]">
                {option.hint}
              </span>
            </button>
          );
        })}
      </div>

      {hasScheduled ? (
        <div className="space-y-3 border-t border-[var(--pr-line-soft)] pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[11.5px] text-[var(--pr-muted)]">
              How often
              <select
                className={fieldClass}
                value={frequency}
                onChange={(event) => {
                  setSaved(false);
                  setFrequency(event.target.value as typeof frequency);
                }}
              >
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
                <option value="monthly">Every month</option>
              </select>
            </label>
            <label className="block text-[11.5px] text-[var(--pr-muted)]">
              At ({timezone})
              <input
                type="time"
                className={fieldClass}
                value={timeLocal}
                onChange={(event) => {
                  setSaved(false);
                  setTimeLocal(event.target.value);
                }}
              />
            </label>
          </div>

          {frequency === "weekly" ? (
            <div>
              <p className="text-[11.5px] text-[var(--pr-muted)]">On</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {WEEKDAYS.map((label, index) => {
                  const active = daysOfWeek.includes(index);
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setSaved(false);
                        setDaysOfWeek((prev) =>
                          prev.includes(index)
                            ? prev.filter((d) => d !== index)
                            : [...prev, index].sort(),
                        );
                      }}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-[12px] transition-colors",
                        active
                          ? "border-transparent bg-[var(--pr-dark)] text-[var(--pr-cream)]"
                          : "border-[var(--pr-line)] text-[var(--pr-soft)] hover:bg-[var(--pr-ink)]/[0.03]",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {frequency === "monthly" ? (
            <label className="block max-w-[12rem] text-[11.5px] text-[var(--pr-muted)]">
              Day of the month
              <input
                type="number"
                min={1}
                max={28}
                className={fieldClass}
                value={dayOfMonth}
                onChange={(event) => {
                  setSaved(false);
                  setDayOfMonth(
                    Math.min(28, Math.max(1, Number(event.target.value) || 1)),
                  );
                }}
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {hasEvent ? (
        <div className="space-y-3 border-t border-[var(--pr-line-soft)] pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[11.5px] text-[var(--pr-muted)]">
              App
              <select
                className={fieldClass}
                value={eventToolkit}
                onChange={(event) => {
                  setSaved(false);
                  setEventToolkit(event.target.value);
                  setAvailable([]);
                  setEventSlug("");
                }}
              >
                {(toolkits.length
                  ? toolkits
                  : [eventToolkit].filter(Boolean)
                ).map((slug) => (
                  <option key={slug} value={slug}>
                    {toolkitDisplayName(slug)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[11.5px] text-[var(--pr-muted)]">
              Event
              <select
                className={fieldClass}
                value={eventSlug}
                onChange={(event) => {
                  setSaved(false);
                  setEventSlug(event.target.value);
                }}
              >
                <option value="">
                  {available.length ? "Choose an event" : "Load events first"}
                </option>
                {eventSlug && !available.some((a) => a.slug === eventSlug) ? (
                  <option value={eventSlug}>{eventSlug}</option>
                ) : null}
                {available.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            disabled={loadingEvents || !eventToolkit}
            onClick={() => void loadTriggers()}
            className="rounded-full border border-[var(--pr-line)] px-3.5 py-1.5 text-[12.5px] text-[var(--pr-soft)] transition-colors hover:bg-[var(--pr-ink)]/[0.03] disabled:opacity-50"
          >
            {loadingEvents ? "Loading" : "Load available events"}
          </button>
        </div>
      ) : null}

      {error ? <ErrorNote message={error} /> : null}

      <div className="flex items-center gap-3 border-t border-[var(--pr-line-soft)] pt-4">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-full bg-[var(--pr-dark)] px-4 py-2 text-[13px] text-[var(--pr-cream)] transition-colors hover:bg-[var(--pr-dark-hover)] disabled:opacity-60"
        >
          {busy ? "Saving" : "Save trigger"}
        </button>
        {saved ? (
          <p className="text-[12.5px] text-[var(--pr-good)]">Saved</p>
        ) : null}
      </div>
    </div>
  );
}
