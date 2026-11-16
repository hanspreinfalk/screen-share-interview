import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "process due automation schedules",
  { minutes: 1 },
  internal.automationEngine.processDueSchedules,
  {},
);

export default crons;
