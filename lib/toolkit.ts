/** Common toolkits shown on the Integrations page for one-click connect. */
export const POPULAR_TOOLKITS = [
  { toolkit: "slack", name: "Slack" },
  { toolkit: "gmail", name: "Gmail" },
  { toolkit: "github", name: "GitHub" },
  { toolkit: "notion", name: "Notion" },
  { toolkit: "linear", name: "Linear" },
  { toolkit: "googlecalendar", name: "Google Calendar" },
  { toolkit: "googlesheets", name: "Google Sheets" },
  { toolkit: "googledrive", name: "Google Drive" },
  { toolkit: "hubspot", name: "HubSpot" },
  { toolkit: "jira", name: "Jira" },
  { toolkit: "discord", name: "Discord" },
  { toolkit: "figma", name: "Figma" },
] as const;

export function toolkitDisplayName(toolkit: string): string {
  const known = POPULAR_TOOLKITS.find((item) => item.toolkit === toolkit);
  if (known) return known.name;
  return toolkit
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Map human app names to Composio toolkit slugs. */
const ALIASES: Record<string, string> = {
  gmail: "gmail",
  googlemail: "gmail",
  slack: "slack",
  notion: "notion",
  github: "github",
  linear: "linear",
  hubspot: "hubspot",
  salesforce: "salesforce",
  airtable: "airtable",
  asana: "asana",
  trello: "trello",
  jira: "jira",
  discord: "discord",
  outlook: "outlook",
  microsoftoutlook: "outlook",
  googlesheets: "googlesheets",
  sheets: "googlesheets",
  "google sheets": "googlesheets",
  googledrive: "googledrive",
  drive: "googledrive",
  "google drive": "googledrive",
  googlecalendar: "googlecalendar",
  calendar: "googlecalendar",
  "google calendar": "googlecalendar",
  googledocs: "googledocs",
  docs: "googledocs",
  "google docs": "googledocs",
  dropbox: "dropbox",
  twitter: "twitter",
  x: "twitter",
  linkedin: "linkedin",
  zoom: "zoom",
  stripe: "stripe",
  shopify: "shopify",
  intercom: "intercom",
  zendesk: "zendesk",
  freshdesk: "freshdesk",
  clickup: "clickup",
  monday: "monday",
  "monday.com": "monday",
  figjam: "figma",
  figma: "figma",
  browserbase: "browserbase_tool",
};

export function toToolkitSlug(app: string): string {
  const key = app.trim().toLowerCase().replace(/[_/]+/g, " ").replace(/\s+/g, " ");
  if (ALIASES[key]) return ALIASES[key];
  const compact = key.replace(/\s+/g, "");
  if (ALIASES[compact]) return ALIASES[compact];
  return compact.replace(/[^a-z0-9_]/g, "");
}

export function inferTriggerTypes(triggerText: string): Array<
  "on_demand" | "scheduled" | "event"
> {
  const t = triggerText.toLowerCase();
  const types: Array<"on_demand" | "scheduled" | "event"> = [];
  if (
    /(every|daily|weekly|monthly|schedule|cron|at \d|each morning|every day)/.test(
      t,
    )
  ) {
    types.push("scheduled");
  }
  if (
    /(when|whenever|new email|incoming|webhook|event|message arrives|ticket|commit)/.test(
      t,
    )
  ) {
    types.push("event");
  }
  if (types.length === 0 || /(manual|on demand|when i ask|button)/.test(t)) {
    types.push("on_demand");
  }
  return [...new Set(types)];
}
