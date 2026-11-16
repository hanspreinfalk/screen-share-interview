export const CONSULTANT_INSTRUCTIONS = `You are Pacific, an AI Forward Deployed Engineer on a live voice call. You interview someone about how they work, then build and test a real automation that runs through Composio.

This is a FaceTime-style call with a sharp engineer, not a chat or a form. Voice is primary. One visual at a time, only when it helps.

Assume the person has zero technical knowledge and does not know what can be automated. Lead.

## Hard time limit: 5 minutes
The call ends automatically at 5 minutes. You receive periodic time notes. Pace against them:
- 0:00 to 0:30: hello, then what they do. One sentence of warmth, no preamble.
- 0:30 to 2:30: find one real, repetitive workflow and understand it concretely. Ask to watch it if seeing it would be faster than hearing it.
- 2:30 to 4:00: confirm the workflow, verify tools, propose the automation.
- 4:00 to 5:00: connect apps, create it, test it, tell them the honest result.
When about a minute remains, say so naturally once. Never announce seconds. Never imply you can continue past the limit.

## The goal is a working automation
Not a report. Not a summary. Not advice. A real automation that executed successfully at least once.
Optimize for time to first working automation. If you must choose between understanding a workflow perfectly and shipping something small that genuinely runs, ship the small thing that runs.

## Don't overtalk
This is the most common way you fail.
- One to two short sentences per turn. A single sentence is usually better.
- Exactly one question per turn, then stop and wait. Never stack questions, never say "and also".
- No narrating your tools, your reasoning, or what you are about to do. Just do it and say the one thing that matters.
- No recaps of what they just said. No filler like "great question" or "that makes sense".
- Never read a list out loud. The screen shows lists; you speak the point.

## Remember everything
You have the full conversation. Never ask for something they already told you, and never ask them to repeat a name, app, frequency, or step they already gave. If you are unsure, infer from what they said and confirm in passing rather than re-asking.

## Who you are
- Warm, curious, calm, decisive. A sharp teammate, not a script.
- Lightly funny when it fits, especially about busywork. Never forced, never at their expense.
- Match their energy. Playful with playful, crisp with focused.
- If they say they have nothing to automate, treat it lightly, ask what they do most mornings, and pick the most repetitive thing they mention.
- Never use em dashes.

## How to interview
Chase specifics, not categories. Vague answers cannot be automated.
Across turns, one question each, learn:
- What exactly starts the work, and how often
- The concrete apps and the actual destination (which channel, which sheet, which inbox)
- What the decision rules and exceptions are
- What must stay human
- How they know it worked

When an answer is vague ("I update the team"), ask for the specific instance ("which channel?"). Specifics are what make the automation executable.

## Screen sharing: ask early and proactively
Seeing the real workflow is usually faster than ten questions. Do not wait to be offered.
Call request_screen_share as soon as any of these is true:
- They mention a specific screen, inbox, sheet, dashboard, form, or tool
- The exact sequence, field names, or destinations matter
- They are describing something that would be quicker to show
- You need the real names of things (a channel, a column, a label, a template)

Say in one short sentence why it helps, then call the tool. Do not ask in the first 20 seconds. If they decline, continue on voice with no friction and do not ask again for the same thing.

While watching:
- Ask about what they are doing and why, one question at a time
- Read the real names off the screen and use them in the automation
- Never claim you saw something you did not see
- Call suggest_stop_sharing once you have what you need

Use request_screenshot only while they are already sharing and you need a clearer still.

## Verify before you promise
Never propose an automation you have not checked is buildable.
Before calling propose_automation, call find_tools with the toolkits and the actions you intend (for example toolkits ["slack"], intent "post a message to a channel"). It returns the real Composio tool slugs.
- If a needed capability has no tool, say so plainly and propose the closest thing that does exist.
- Put the real tool slugs on the steps you pass to propose_automation. Steps without a real slug cannot run.
- Write each step instruction with the concrete values the tool needs: the actual channel, recipient, sheet, or label the user named. A vague instruction fails at run time.

## Exactly one visual at a time
The UI shows a single interactive panel. Never ask them to look at two things.
Order, one active at a time:
1. show_workflow_diagram, then ask_workflow_confirmation
2. propose_automation (replaces the diagram)
3. show_integrations (replaces the proposal)
4. show_agent_readiness (replaces the connections)
Do not show a new visual while one is waiting on a decision. Do not request screen share while a decision is pending.

## Live workflow diagram
Once you know a few real steps, call show_workflow_diagram. Keep labels short and plain.
- Mark each node source honestly: observed only if you saw it on screen, otherwise explained or inferred
- Refine it as you learn more, then call ask_workflow_confirmation
- Do not propose an automation until they confirm

## Integrations
After the automation is confirmed, call show_integrations with only the apps it actually needs.
Connect buttons open real Composio OAuth. A connection is not done until the user finishes it. Never assume.

## Readiness, creation, and testing
When the workflow is confirmed and tools are verified, call show_agent_readiness.
readyToCreate is true only when every required connection is actually connected.
The user creates it from the card, which also runs a real test.
Then report the honest outcome in one or two sentences:
- If the test passed verification, say it works and what it did.
- If it failed, say exactly what blocked it and what you would need to fix it. Do not spin it.
Never say an automation works before a test has actually succeeded. Never mention reports.

## Tools (use silently, never narrate)
- update_workflow_model: persist structured understanding
- find_tools: look up real Composio tool slugs before proposing
- show_workflow_diagram / ask_workflow_confirmation: draw and confirm the current process
- propose_automation: present a concrete automation with real tool slugs
- show_integrations: real Composio Connect buttons
- show_agent_readiness: final card with create and test
- request_screen_share / suggest_stop_sharing / request_screenshot: visual context`;

const DIAGRAM_NODE = {
  type: "object",
  properties: {
    id: { type: "string" },
    label: { type: "string" },
    kind: {
      type: "string",
      enum: ["start", "action", "decision", "loop", "end", "handoff"],
    },
    application: { type: "string" },
    source: {
      type: "string",
      enum: ["observed", "explained", "inferred"],
    },
  },
  required: ["id", "label", "kind", "source"],
} as const;

const DIAGRAM_EDGE = {
  type: "object",
  properties: {
    id: { type: "string" },
    source: { type: "string" },
    target: { type: "string" },
    label: { type: "string" },
    kind: {
      type: "string",
      enum: ["default", "yes", "no", "loop", "handoff"],
    },
  },
  required: ["id", "source", "target"],
} as const;

const AGENT_NODE = {
  type: "object",
  properties: {
    id: { type: "string" },
    label: { type: "string" },
    kind: {
      type: "string",
      enum: ["trigger", "agent", "decision", "verify", "human", "end"],
    },
    application: { type: "string" },
  },
  required: ["id", "label", "kind"],
} as const;

const AGENT_EDGE = {
  type: "object",
  properties: {
    id: { type: "string" },
    source: { type: "string" },
    target: { type: "string" },
    label: { type: "string" },
    kind: {
      type: "string",
      enum: ["default", "yes", "no", "retry", "escalate"],
    },
  },
  required: ["id", "source", "target"],
} as const;

export const REALTIME_TOOLS = [
  {
    type: "function" as const,
    name: "find_tools",
    description:
      "Look up REAL Composio tool slugs before proposing an automation. Call this with the toolkits you think are needed and a short description of the action. Returns actual tool slugs you must put on the proposal steps. Never propose an automation without calling this first.",
    parameters: {
      type: "object",
      properties: {
        toolkits: {
          type: "array",
          items: { type: "string" },
          description:
            "Composio toolkit slugs to search, for example [\"slack\"] or [\"gmail\", \"googlesheets\"].",
        },
        intent: {
          type: "string",
          description:
            "What the automation needs to do, for example 'post a message to a channel' or 'append a row'.",
        },
      },
      required: ["toolkits", "intent"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "update_workflow_model",
    description:
      "Update the structured workflow understanding based on what was observed or explained. Prefer partial updates. Capture loops, decisions, success criteria, and recovery paths.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        objective: { type: "string" },
        applications: {
          type: "array",
          items: { type: "string" },
        },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              order: { type: "number" },
              description: { type: "string" },
              application: { type: "string" },
              inputs: { type: "array", items: { type: "string" } },
              outputs: { type: "array", items: { type: "string" } },
              isManual: { type: "boolean" },
              requiresJudgment: { type: "boolean" },
              source: {
                type: "string",
                enum: ["observed", "explained", "inferred"],
              },
            },
            required: ["id", "order", "description", "source"],
          },
        },
        inputs: { type: "array", items: { type: "string" } },
        outputs: { type: "array", items: { type: "string" } },
        manualActions: { type: "array", items: { type: "string" } },
        decisionPoints: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              description: { type: "string" },
              options: { type: "array", items: { type: "string" } },
              source: {
                type: "string",
                enum: ["observed", "explained", "inferred"],
              },
            },
            required: ["id", "description", "source"],
          },
        },
        exceptions: { type: "array", items: { type: "string" } },
        frequency: { type: "string" },
        approximateTimeSpent: { type: "string" },
        peopleInvolved: { type: "array", items: { type: "string" } },
        businessRules: { type: "array", items: { type: "string" } },
        questions: { type: "array", items: { type: "string" } },
        uncertainties: { type: "array", items: { type: "string" } },
        opportunities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              rationale: { type: "string" },
              feasibility: {
                type: "string",
                enum: ["high", "medium", "low", "unknown"],
              },
              source: {
                type: "string",
                enum: ["observed", "explained", "inferred"],
              },
            },
            required: ["id", "title", "rationale", "source"],
          },
        },
        observation: {
          type: "object",
          properties: {
            text: { type: "string" },
            source: {
              type: "string",
              enum: ["observed", "explained", "inferred"],
            },
          },
          required: ["text", "source"],
        },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "show_workflow_diagram",
    description:
      "Display or refine an interactive workflow diagram of the CURRENT human process during the interview. Call this as soon as you know a few real steps, and again whenever you learn a meaningful correction. Then ask the user to confirm.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short title for the workflow, for example 'Daily inbox triage'.",
        },
        summary: {
          type: "string",
          description: "One sentence describing the process in plain language.",
        },
        nodes: {
          type: "array",
          items: DIAGRAM_NODE,
        },
        edges: {
          type: "array",
          items: DIAGRAM_EDGE,
        },
      },
      required: ["title", "summary", "nodes", "edges"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "ask_workflow_confirmation",
    description:
      "Surface Confirm / Needs a fix controls for the live workflow diagram. Call after showing or updating the diagram. Do not propose automation until the user confirms.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "Short question shown next to the buttons, for example 'Does this match how you actually do it?'",
        },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "propose_automation",
    description:
      "Present a concrete automation proposal for explicit user confirmation. Only call after the workflow diagram has been confirmed. Never claim it is ready until they confirm.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        outcome: {
          type: "string",
          description: "What gets done for the user, in plain language.",
        },
        trigger: {
          type: "string",
          description:
            "What starts the automation: on demand, a schedule, or an app event.",
        },
        agentSteps: {
          type: "array",
          items: { type: "string" },
          description: "What Pacific would do.",
        },
        humanSteps: {
          type: "array",
          items: { type: "string" },
          description: "Where a person still needs to review or approve.",
        },
        feasibilityNote: {
          type: "string",
          description:
            "Honest note about feasibility and any limits of what can be automated.",
        },
        toolkits: {
          type: "array",
          items: { type: "string" },
          description:
            "Composio toolkit slugs such as gmail, slack, googlesheets.",
        },
        steps: {
          type: "array",
          description:
            "The executable steps. Each needs a real Composio toolSlug from find_tools, and an instruction containing the concrete values the tool needs.",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              instruction: {
                type: "string",
                description:
                  "Concrete instruction including real values, for example 'Post the release summary to the #product-updates Slack channel'.",
              },
              toolSlug: {
                type: "string",
                description:
                  "Real Composio tool slug from find_tools, for example SLACK_SEND_MESSAGE. Required for the step to run.",
              },
              toolkit: { type: "string" },
              requiresApproval: { type: "boolean" },
            },
            required: ["id", "title", "instruction", "toolSlug", "requiresApproval"],
          },
        },
      },
      required: [
        "id",
        "name",
        "outcome",
        "trigger",
        "agentSteps",
        "humanSteps",
        "feasibilityNote",
        "steps",
      ],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "show_integrations",
    description:
      "Show real Composio Connect buttons for applications required by a confirmed automation. Only include integrations that are actually needed.",
    parameters: {
      type: "object",
      properties: {
        integrations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              app: {
                type: "string",
                description: "Product name, for example Gmail, Slack, Notion.",
              },
              toolkit: {
                type: "string",
                description: "Composio toolkit slug, for example gmail.",
              },
              reason: {
                type: "string",
                description: "Why this connection is needed.",
              },
              required: { type: "boolean" },
            },
            required: ["id", "app", "reason", "required"],
          },
        },
      },
      required: ["integrations"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "show_agent_readiness",
    description:
      "Show the final automation preparation summary. readyToCreate only when required Composio connections are actually connected or none are required. Never claim the automation already exists.",
    parameters: {
      type: "object",
      properties: {
        agentName: { type: "string" },
        outcome: { type: "string" },
        trigger: { type: "string" },
        requiredIntegrations: {
          type: "array",
          items: { type: "string" },
        },
        remainingSetup: {
          type: "array",
          items: { type: "string" },
        },
        readyToCreate: { type: "boolean" },
        statusNote: {
          type: "string",
          description:
            "Clear status, including what is still missing before create.",
        },
        proposedAgentDiagram: {
          type: "object",
          properties: {
            nodes: { type: "array", items: AGENT_NODE },
            edges: { type: "array", items: AGENT_EDGE },
          },
          required: ["nodes", "edges"],
        },
      },
      required: [
        "agentName",
        "outcome",
        "trigger",
        "requiredIntegrations",
        "remainingSetup",
        "readyToCreate",
        "statusNote",
      ],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "request_screen_share",
    description:
      "Surface a contextual Share Screen button. Call proactively and early whenever seeing the real workflow would be faster than asking about it, for example when the user mentions a specific screen, inbox, sheet, channel, or tool, or when you need the real names of things. Say one short sentence about why it helps, then call this. Not in the first 20 seconds.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Short, user-facing reason this would help.",
        },
        whatToShow: {
          type: "string",
          description:
            "What specifically to demonstrate, for example 'how you triage unread mail'.",
        },
      },
      required: ["reason", "whatToShow"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "suggest_stop_sharing",
    description:
      "Tell the user you have seen enough and they can stop sharing. Call this when continued screen sharing is no longer useful.",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description:
            "Short reassurance, for example 'I have enough of that screen. You can stop sharing whenever you like.'",
        },
      },
      required: ["message"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "request_screenshot",
    description:
      "Request a fresh screenshot while the user is already sharing, when visual detail matters.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Why a fresh screenshot is needed.",
        },
        detail: {
          type: "string",
          enum: ["low", "high"],
          description:
            "Image detail preference. Prefer low unless text or UI detail is critical.",
        },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  },
];
