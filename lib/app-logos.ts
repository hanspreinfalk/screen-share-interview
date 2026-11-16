import * as simpleIcons from "simple-icons";

/**
 * Resolves a free-text application name (whatever the model reports, e.g.
 * "Cursor", "localhost browser", "GitHub PR") to a real brand logo.
 *
 * Three tiers, in order:
 *   1. simple-icons  -> official SVG path, exact brand colour, bundled offline.
 *   2. favicon        -> real logo for brands simple-icons dropped (Slack,
 *                        VS Code, Salesforce) or anything we did not map.
 *   3. monogram       -> neutral initial. Never a wrong or invented logo.
 */

export type AppLogo =
  | { kind: "svg"; title: string; path: string; hex: string }
  | { kind: "favicon"; title: string; src: string }
  | { kind: "monogram"; title: string; initial: string };

type SimpleIcon = {
  title: string;
  hex: string;
  path: string;
};

const icons = simpleIcons as unknown as Record<string, SimpleIcon | undefined>;

/**
 * Maps normalised app names to a simple-icons export name.
 * Keys are matched by substring, so "cursor ide" and "in cursor" both hit
 * "cursor". Longer keys are tested first so "google sheets" wins over "google".
 */
const SIMPLE_ICON_ALIASES: Record<string, string> = {
  // Editors / dev
  cursor: "siCursor",
  github: "siGithub",
  gitlab: "siGitlab",
  bitbucket: "siBitbucket",
  git: "siGit",
  vercel: "siVercel",
  netlify: "siNetlify",
  docker: "siDocker",
  postman: "siPostman",
  insomnia: "siInsomnia",
  sentry: "siSentry",
  datadog: "siDatadog",
  supabase: "siSupabase",
  firebase: "siFirebase",
  postgresql: "siPostgresql",
  postgres: "siPostgresql",
  mysql: "siMysql",
  mongodb: "siMongodb",
  redis: "siRedis",
  prisma: "siPrisma",
  nextjs: "siNextdotjs",
  "next.js": "siNextdotjs",
  react: "siReact",
  nodejs: "siNodedotjs",
  "node.js": "siNodedotjs",
  python: "siPython",
  typescript: "siTypescript",
  javascript: "siJavascript",
  puppeteer: "siPuppeteer",
  cypress: "siCypress",
  jest: "siJest",
  vitest: "siVitest",
  storybook: "siStorybook",
  jenkins: "siJenkins",
  circleci: "siCircleci",
  terraform: "siTerraform",
  kubernetes: "siKubernetes",
  cloudflare: "siCloudflare",

  // Browsers
  "google chrome": "siGooglechrome",
  chrome: "siGooglechrome",
  firefox: "siFirefoxbrowser",
  safari: "siSafari",
  arc: "siArc",
  brave: "siBrave",

  // Google
  "google sheets": "siGooglesheets",
  "google docs": "siGoogledocs",
  "google drive": "siGoogledrive",
  "google slides": "siGoogleslides",
  "google forms": "siGoogleforms",
  "google calendar": "siGooglecalendar",
  "google meet": "siGooglemeet",
  "google analytics": "siGoogleanalytics",
  "google cloud": "siGooglecloud",
  gmail: "siGmail",
  looker: "siLooker",

  // Work / PM
  notion: "siNotion",
  linear: "siLinear",
  jira: "siJira",
  confluence: "siConfluence",
  asana: "siAsana",
  trello: "siTrello",
  clickup: "siClickup",
  basecamp: "siBasecamp",
  airtable: "siAirtable",
  zapier: "siZapier",
  make: "siMake",
  retool: "siRetool",

  // Comms
  discord: "siDiscord",
  zoom: "siZoom",
  telegram: "siTelegram",
  whatsapp: "siWhatsapp",
  intercom: "siIntercom",
  zendesk: "siZendesk",

  // Design
  figma: "siFigma",
  sketch: "siSketch",
  framer: "siFramer",
  miro: "siMiro",

  // Business
  stripe: "siStripe",
  shopify: "siShopify",
  quickbooks: "siQuickbooks",
  xero: "siXero",
  hubspot: "siHubspot",
  mailchimp: "siMailchimp",
  dropbox: "siDropbox",
  box: "siBox",
  calendly: "siCalendly",
  mixpanel: "siMixpanel",
  snowflake: "siSnowflake",
  databricks: "siDatabricks",

  // AI
  anthropic: "siAnthropic",
  claude: "siClaude",
  huggingface: "siHuggingface",
  ollama: "siOllama",
  langchain: "siLangchain",
  perplexity: "siPerplexity",

  // Apple / misc
  "apple mail": "siApple",
  xcode: "siXcode",
  linux: "siLinux",
  ubuntu: "siUbuntu",
  obsidian: "siObsidian",
  evernote: "siEvernote",
  todoist: "siTodoist",
  "1password": "si1password",
  okta: "siOkta",
  auth0: "siAuth0",
};

/**
 * Brands simple-icons does not ship (trademark removals) or that are better
 * served by their real favicon. Maps to the domain the icon is fetched from.
 */
const FAVICON_DOMAINS: Record<string, string> = {
  slack: "slack.com",
  "visual studio code": "code.visualstudio.com",
  "vs code": "code.visualstudio.com",
  vscode: "code.visualstudio.com",
  salesforce: "salesforce.com",
  openai: "openai.com",
  chatgpt: "openai.com",
  "microsoft excel": "microsoft.com",
  excel: "microsoft.com",
  "microsoft word": "microsoft.com",
  word: "microsoft.com",
  outlook: "outlook.com",
  "microsoft teams": "microsoft.com",
  teams: "microsoft.com",
  onedrive: "microsoft.com",
  sharepoint: "microsoft.com",
  powerpoint: "microsoft.com",
  "microsoft 365": "microsoft.com",
  office: "microsoft.com",
  aws: "aws.amazon.com",
  "amazon web services": "aws.amazon.com",
  azure: "azure.microsoft.com",
  netsuite: "netsuite.com",
  workday: "workday.com",
  sap: "sap.com",
  hightouch: "hightouch.com",
  composio: "composio.dev",
  windsurf: "windsurf.com",
  copilot: "github.com",
  loom: "loom.com",
  gusto: "gusto.com",
  ramp: "ramp.com",
  brex: "brex.com",
  plaid: "plaid.com",
  // Brands with no current simple-icons export.
  playwright: "playwright.dev",
  monday: "monday.com",
  "monday.com": "monday.com",
  front: "front.com",
  twilio: "twilio.com",
  canva: "canva.com",
  sendgrid: "sendgrid.com",
  docusign: "docusign.com",
  amplitude: "amplitude.com",
  segment: "segment.com",
  tableau: "tableau.com",
};

/** Generic surfaces that are not a brand. Rendering a logo here would lie. */
const GENERIC_TERMS = [
  "browser",
  "terminal",
  "shell",
  "command line",
  "cli",
  "localhost",
  "local app",
  "web app",
  "spreadsheet",
  "email",
  "inbox",
  "database",
  "api",
  "dashboard",
  "crm",
  "erp",
  "internal tool",
  "admin panel",
  "file system",
  "desktop",
  "phone",
  "pdf",
  "document",
  "form",
  "portal",
  "website",
  "server",
  "ide",
  "editor",
  "code editor",
  "text editor",
];

function normalise(value: string) {
  return value
    .toLowerCase()
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Longest keys first so "google sheets" is tested before "google". */
function sortedKeys(record: Record<string, string>) {
  return Object.keys(record).sort((a, b) => b.length - a.length);
}

const SIMPLE_KEYS = sortedKeys(SIMPLE_ICON_ALIASES);
const FAVICON_KEYS = sortedKeys(FAVICON_DOMAINS);

function matchKey(haystack: string, keys: string[]) {
  // Prefer a whole-word hit so "box" does not match "dropbox".
  for (const key of keys) {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(key)}([^a-z0-9]|$)`);
    if (pattern.test(haystack)) return key;
  }
  return null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function initialOf(value: string) {
  const match = value.match(/[a-z0-9]/i);
  return match ? match[0].toUpperCase() : "?";
}

/**
 * Resolve an application name to a logo. Returns null for generic surfaces
 * and empty values so callers can render nothing rather than a fake brand.
 */
export function resolveAppLogo(rawName?: string | null): AppLogo | null {
  if (!rawName) return null;
  const name = normalise(rawName);
  if (!name) return null;

  const simpleKey = matchKey(name, SIMPLE_KEYS);
  if (simpleKey) {
    const icon = icons[SIMPLE_ICON_ALIASES[simpleKey]];
    if (icon?.path) {
      return {
        kind: "svg",
        title: icon.title,
        path: icon.path,
        hex: `#${icon.hex}`,
      };
    }
  }

  const faviconKey = matchKey(name, FAVICON_KEYS);
  if (faviconKey) {
    return {
      kind: "favicon",
      title: rawName.trim(),
      src: faviconUrl(FAVICON_DOMAINS[faviconKey]),
    };
  }

  // Generic surface with no brand: render no logo at all.
  if (matchKey(name, GENERIC_TERMS)) return null;

  // An unmapped proper noun. Try its favicon, then fall back to a monogram.
  const slug = name.replace(/[^a-z0-9]/g, "");
  if (slug.length >= 3 && slug.length <= 20) {
    return {
      kind: "favicon",
      title: rawName.trim(),
      src: faviconUrl(`${slug}.com`),
    };
  }

  return {
    kind: "monogram",
    title: rawName.trim(),
    initial: initialOf(name),
  };
}

function faviconUrl(domain: string) {
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}
