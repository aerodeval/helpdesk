// The guided tour's script and its pure reducer, lifted from the #56 prototype. No DOM in here,
// so check.ts runs it in node. Copy is English: the demo is not translated (map #51).
import type { Persona } from "./session";

export const STOPS = 7;

export const STOP_LABELS = [
  "",
  "Inbox and views",
  "SLA and reply",
  "Saved replies",
  "Comments and assignment",
  "Knowledge base",
  "Customer portal",
  "Dashboard",
];

export type StepId =
  | "intro_help"
  | "intro_raise"
  | "welcome"
  | "views"
  | "sla"
  | "reply"
  | "sla_met"
  | "saved"
  | "comment"
  | "assign"
  | "kb"
  | "portal"
  | "portal_new"
  | "portal_back"
  | "portal_landed"
  | "dashboard"
  | "end";

export interface Step {
  id: StepId;
  // 0 for the intro and welcome cards, 8 for the end card
  stop: number;
  persona: Persona;
  // where the step happens, for the resume notice
  where: string;
  title: string;
  body: string;
  // the visitor action that unlocks Next
  wait?: string;
  // where Next goes when it is not the following step
  next?: StepId;
}

export const STEPS: Step[] = [
  // The customer-first entry: two portal cards, then the main tour at "Already in your inbox"
  {
    id: "intro_help",
    stop: 0,
    persona: "customer",
    where: "Fernbill Help Center",
    title: "Priya's help center",
    body: "You're Priya Nair at Greenleaf Studio, one of Fernbill's customers. Customers see their own tickets and can search Fernbill's articles. Your changes stay in your browser.",
  },
  {
    id: "intro_raise",
    stop: 0,
    persona: "customer",
    where: "Fernbill Help Center",
    title: "Raise a ticket",
    body: "Ask Fernbill a question. Your ticket goes straight to their support team.",
    wait: "raise_ticket",
    next: "portal_landed",
  },
  {
    id: "welcome",
    stop: 0,
    persona: "agent",
    where: "Ticket list",
    title: "Welcome to Fernbill Support",
    body: "You're Jamie Rivera, Support Lead at Fernbill. Fernbill makes invoicing software for small businesses, and this is their help desk. Take a 3-minute tour, or look around on your own. Your changes stay in your browser.",
  },
  {
    id: "views",
    stop: 1,
    persona: "agent",
    where: "Ticket list",
    title: "Your inbox",
    body: "Every customer email becomes a ticket. Views are saved filters your team shares. Open the tickets assigned to you.",
    wait: "open_view",
  },
  {
    id: "sla",
    stop: 2,
    persona: "agent",
    where: "Assigned to me",
    title: "Deadlines you can see",
    body: "Northpeak is on the Enterprise plan. Urgent tickets need a first reply within an hour, and this one is due in 25 minutes. Open it.",
    wait: "open_northpeak",
  },
  {
    id: "reply",
    stop: 2,
    persona: "agent",
    where: "Northpeak ticket",
    title: "Reply from the ticket",
    body: "Write back to Northpeak. They get your reply as an email, and the whole conversation stays on this ticket.",
    wait: "send_reply",
  },
  {
    id: "sla_met",
    stop: 2,
    persona: "agent",
    where: "Northpeak ticket",
    title: "First response: on time",
    body: "The first-response clock has stopped. The SLA now tracks how long the ticket takes to resolve.",
  },
  {
    id: "saved",
    stop: 3,
    persona: "agent",
    where: "Ticket: How do I download past invoices?",
    title: "Same question, same answer",
    body: 'Customers ask how to download past invoices every week. Insert the "Download invoices" saved reply and send it.',
    wait: "insert_saved_reply",
  },
  {
    id: "comment",
    stop: 4,
    persona: "agent",
    where: "Ticket: Refund for a double charge",
    title: "Talk to your team privately",
    body: "Ananya needs your approval for a $240 refund. Comments are only visible to agents. Approve it and mention @Ananya.",
    wait: "post_comment",
  },
  {
    id: "assign",
    stop: 4,
    persona: "agent",
    where: "Ticket: Refund for a double charge",
    title: "Hand it back",
    body: "Assign the ticket to Ananya so she can issue the refund.",
    wait: "assign",
  },
  {
    id: "kb",
    stop: 5,
    persona: "agent",
    where: "Ticket: Can I invoice in euros?",
    title: "Answer once, help everyone",
    body: "Your help center has no article on multi-currency invoices yet. Write a short one. Customers will find it before they need to ask.",
    wait: "save_article",
  },
  {
    id: "portal",
    stop: 6,
    persona: "agent",
    where: "Knowledge base",
    title: "Now be the customer",
    body: "Switch to Priya Nair at Greenleaf Studio, one of Fernbill's customers.",
    wait: "switch_to_customer",
  },
  {
    id: "portal_new",
    stop: 6,
    persona: "customer",
    where: "Fernbill Help Center",
    title: "Priya's help center",
    body: "Customers see their own tickets and can search your articles. Raise a ticket as Priya.",
    wait: "raise_ticket",
  },
  {
    id: "portal_back",
    stop: 6,
    persona: "customer",
    where: "Priya's new ticket",
    title: "Back to Jamie",
    body: "Switch back to Jamie and see where Priya's ticket lands.",
    wait: "switch_to_agent",
  },
  {
    id: "portal_landed",
    stop: 6,
    persona: "agent",
    where: "Ticket list",
    title: "Already in your inbox",
    body: "Priya's ticket is here, with the right SLA for her plan already set.",
  },
  {
    id: "dashboard",
    stop: 7,
    persona: "agent",
    where: "Dashboard",
    title: "How the team is doing",
    body: "Volume jumped after last week's v3 release, and first responses stayed on time. Customer ratings are holding above 4 out of 5.",
  },
  {
    id: "end",
    stop: 8,
    persona: "agent",
    where: "Dashboard",
    title: "That's Helpdesk",
    body: "There's more to try in the checklist: assignment rules, customer ratings and the command palette. Ready to run it for your own team?",
  },
];

export const EXTRAS = [
  { id: "x_rules", label: "See how tickets get assigned automatically", action: "open_assignment_rules" },
  { id: "x_csat", label: "Read a customer rating", action: "open_rating" },
  { id: "x_cmdk", label: "Press ⌘K and jump to any ticket", action: "use_cmdk" },
];

export type TourStatus = "not_started" | "running" | "paused" | "dismissed" | "finished_card" | "finished";

export interface TourState {
  persona: Persona;
  tour: TourStatus;
  step: number;
  done: string[];
  stopsDone: number[];
  extrasDone: string[];
  notice: string;
}

export type TourAction =
  | { type: "START" | "START_INTRO" | "DISMISS" | "NEXT" | "SKIP" | "BACK" | "WANDER" | "RESUME" }
  | { type: "DO"; what: string }
  | { type: "FINISH" };

const NAMES: Record<Persona, string> = { agent: "Jamie", customer: "Priya" };

export function initialState(persona: Persona = "agent"): TourState {
  return { persona, tour: "not_started", step: indexOf("welcome"), done: [], stopsDone: [], extrasDone: [], notice: "" };
}

export function indexOf(id: StepId) {
  return STEPS.findIndex((step) => step.id === id);
}

export function stepAt(state: TourState) {
  return STEPS[state.step]!;
}

export function isWaiting(state: TourState) {
  const wait = stepAt(state).wait;
  return Boolean(wait && !state.done.includes(wait));
}

export function canGoBack(state: TourState) {
  return tourReducer(state, { type: "BACK" }).step !== state.step;
}

export function tourReducer(state: TourState, action: TourAction): TourState {
  const cur = stepAt(state);
  switch (action.type) {
    case "START":
      return { ...advance(state, indexOf("views")), tour: "running" };
    case "START_INTRO":
      return { ...state, tour: "running", step: indexOf("intro_help"), notice: "" };
    case "DISMISS":
      return { ...state, tour: "dismissed", notice: "Tour closed. It stays one click away in the checklist." };
    case "NEXT":
      if (state.tour !== "running") return state;
      if (isWaiting(state)) return { ...state, notice: "Next unlocks when you do the step. Or skip it." };
      return advance(state, cur.next ? indexOf(cur.next) : state.step + 1);
    case "SKIP":
      if (state.tour !== "running") return state;
      return advance(state, cur.next ? indexOf(cur.next) : state.step + 1);
    case "BACK": {
      const prev = STEPS[state.step - 1];
      if (state.tour !== "running" || !prev || prev.id === "welcome") return state;
      if (prev.persona !== state.persona) return { ...state, notice: "Back can't cross a persona switch." };
      return { ...state, step: state.step - 1, notice: "" };
    }
    case "DO":
      return did(state, action.what);
    case "WANDER":
      if (state.tour !== "running") return state;
      return { ...state, tour: "paused", notice: "Tour paused while you look around." };
    case "RESUME": {
      if (!["paused", "dismissed"].includes(state.tour)) return state;
      const step = cur.id === "welcome" ? indexOf("views") : state.step;
      // resuming takes the visitor back to the step's page, switching persona if needed
      return { ...state, tour: "running", step, persona: STEPS[step]!.persona, notice: `Back on: ${STEPS[step]!.where}.` };
    }
    case "FINISH":
      return { ...state, tour: "finished", notice: "" };
    default:
      return state;
  }
}

function did(state: TourState, what: string): TourState {
  const cur = stepAt(state);
  const done = state.done.includes(what) ? state.done : [...state.done, what];
  const next = { ...state, done, notice: "" };
  const extra = EXTRAS.find((e) => e.action === what);
  if (extra && !next.extrasDone.includes(extra.id)) next.extrasDone = [...next.extrasDone, extra.id];
  if (what === "switch_to_customer") next.persona = "customer";
  if (what === "switch_to_agent") next.persona = "agent";
  if (state.tour === "running" && cur.wait === what) {
    // the intro's last card waits for its own button, which switches persona
    return cur.next ? next : advance(next, state.step + 1);
  }
  // persona switched off-script: the tour can't show agent cards in the portal
  if (state.tour === "running" && next.persona !== cur.persona) {
    return { ...next, tour: "paused", notice: `Tour paused: this step happens as ${NAMES[cur.persona]}.` };
  }
  return next;
}

// A stop is done when the visitor moves on from its last step.
function advance(state: TourState, to: number): TourState {
  const from = stepAt(state);
  const next = { ...state, step: to, notice: "" };
  const isLastOfStop = STEPS[state.step + 1]?.stop !== from.stop;
  if (to > state.step && isLastOfStop && from.stop >= 1 && from.stop <= STOPS && !state.stopsDone.includes(from.stop)) {
    next.stopsDone = [...state.stopsDone, from.stop];
  }
  if (STEPS[to]!.id === "end") next.tour = "finished_card";
  return next;
}
