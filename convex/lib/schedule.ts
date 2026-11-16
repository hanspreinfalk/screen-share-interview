import type { Infer } from "convex/values";
import type { triggerSchedule } from "./validators";

type Schedule = Infer<typeof triggerSchedule>;

function parseTimeLocal(timeLocal: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeLocal.trim());
  if (!match) {
    return { hour: 9, minute: 0 };
  }
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return { hour, minute };
}

/** Local wall-clock parts for an instant in an IANA timezone. */
function zonedParts(
  date: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0=Sun .. 6=Sat
} {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "0";

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

/**
 * Approximate UTC ms for a local wall time in `timeZone`.
 * Uses iterative offset correction (handles DST for common cases).
 */
function zonedTimeToUtc(
  parts: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second?: number;
  },
  timeZone: string,
): number {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second ?? 0,
  );

  let instant = utcGuess;
  for (let i = 0; i < 3; i++) {
    const asLocal = zonedParts(new Date(instant), timeZone);
    const asLocalUtc = Date.UTC(
      asLocal.year,
      asLocal.month - 1,
      asLocal.day,
      asLocal.hour,
      asLocal.minute,
      asLocal.second,
    );
    const desiredUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second ?? 0,
    );
    instant += desiredUtc - asLocalUtc;
  }
  return instant;
}

function addDays(
  year: number,
  month: number,
  day: number,
  days: number,
): { year: number; month: number; day: number } {
  const dt = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    day: dt.getUTCDate(),
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Compute the next run timestamp (ms) after `fromMs` for a schedule.
 * For cron-only schedules without frequency, returns null (caller should set nextRunAt explicitly).
 */
export function computeNextRunAt(
  schedule: Schedule,
  fromMs: number = Date.now(),
): number | null {
  if ("frequency" in schedule) {
    return computeFrequencyNextRun(schedule, fromMs);
  }
  // Cron-only: prefer explicit nextRunAt; otherwise leave to caller.
  if (schedule.nextRunAt !== undefined && schedule.nextRunAt > fromMs) {
    return schedule.nextRunAt;
  }
  return null;
}

function computeFrequencyNextRun(
  schedule: Extract<Schedule, { frequency: unknown }>,
  fromMs: number,
): number | null {
  const { hour, minute } = parseTimeLocal(schedule.timeLocal);
  const timeZone = schedule.timezone || "UTC";
  const from = new Date(fromMs);
  const local = zonedParts(from, timeZone);

  const candidateToday = zonedTimeToUtc(
    {
      year: local.year,
      month: local.month,
      day: local.day,
      hour,
      minute,
      second: 0,
    },
    timeZone,
  );

  if (schedule.frequency === "daily") {
    if (candidateToday > fromMs) {
      return candidateToday;
    }
    const next = addDays(local.year, local.month, local.day, 1);
    return zonedTimeToUtc({ ...next, hour, minute, second: 0 }, timeZone);
  }

  if (schedule.frequency === "weekly") {
    const days =
      schedule.daysOfWeek && schedule.daysOfWeek.length > 0
        ? [...schedule.daysOfWeek].sort((a, b) => a - b)
        : [local.weekday];
    for (let offset = 0; offset < 14; offset++) {
      const d = addDays(local.year, local.month, local.day, offset);
      const instant = zonedTimeToUtc(
        { ...d, hour, minute, second: 0 },
        timeZone,
      );
      const wd = zonedParts(new Date(instant), timeZone).weekday;
      if (days.includes(wd) && instant > fromMs) {
        return instant;
      }
    }
    return null;
  }

  if (schedule.frequency === "monthly") {
    const targetDay = Math.min(
      schedule.dayOfMonth ?? local.day,
      daysInMonth(local.year, local.month),
    );
    const thisMonth = zonedTimeToUtc(
      {
        year: local.year,
        month: local.month,
        day: targetDay,
        hour,
        minute,
        second: 0,
      },
      timeZone,
    );
    if (thisMonth > fromMs) {
      return thisMonth;
    }
    let year = local.year;
    let month = local.month + 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const nextDay = Math.min(targetDay, daysInMonth(year, month));
    return zonedTimeToUtc(
      { year, month, day: nextDay, hour, minute, second: 0 },
      timeZone,
    );
  }

  // custom: if cron nextRunAt provided use it; else treat like daily
  if (schedule.nextRunAt !== undefined && schedule.nextRunAt > fromMs) {
    return schedule.nextRunAt;
  }
  if (candidateToday > fromMs) {
    return candidateToday;
  }
  const next = addDays(local.year, local.month, local.day, 1);
  return zonedTimeToUtc({ ...next, hour, minute, second: 0 }, timeZone);
}
