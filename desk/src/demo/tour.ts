// The desk side of the guided tour: where each Tour Stop points, the page it happens on and
// what its "Show me" does. Scene Tickets are found by subject, as the seed numbers tickets afresh.
import { isOpen as paletteOpen, openPalette } from "@/components/command-palette/useCommandPalette";
import {
  activeTab,
  setActiveSettingsTab,
  showSettingsModal,
} from "@/components/Settings/settingsModal";
import { reloadTicket, reloadTicketFeed } from "@/composables/useTicket";
import { router } from "@/router";
import { minimize, showHelpModal, useOnboarding } from "@framework/ui";
import { CHECKLIST, dockActions, loginUrl } from "@helpdesk/shared/demo";
import { EXTRAS, newTicketName, STOP_LABELS, STOPS, tour, type Stop } from "@helpdesk/shared/demo/tour";
import { call } from "frappe-ui";
import { watch } from "vue";
import LucideCircleDot from "~icons/lucide/circle-dot";
import LucideCommand from "~icons/lucide/command";
import LucideStar from "~icons/lucide/star";
import LucideWorkflow from "~icons/lucide/workflow";

const SCENES = {
  northpeak: "Card payments failing for all our customers since this morning",
  saved: "How do I download past invoices?",
  refund: "Refund for a double charge",
  euros: "Can I invoice in euros?",
};
const ASSIGNED_VIEW = "STD-VIEW-RECENTLY-ASSIGNED-TICKETS";
const RATINGS_VIEW = "STD-VIEW-ALL-FEEDBACK";
const ANANYA = { email: "ananya@fernbill.example", name: "Ananya Iyer" };
const KB_PAGES = ["AgentKnowledgeBase", "NewArticle", "Article"];

const scene: Record<keyof typeof SCENES, string> = { northpeak: "", saved: "", refund: "", euros: "" };

export async function startDeskTour() {
  await findScenes();
  setUpChecklist();
  watch(paletteOpen, (open) => open && tour.did("use_cmdk"));
  watch([showSettingsModal, activeTab], ([open, tab]) => {
    if (open && tab?.label === "Assignment Rules") tour.did("open_assignment_rules");
  });
  await tour.start({
    persona: "agent",
    stops: stops(),
    navigate: (to) => router.push(to as any),
    onRoute: (callback) => router.afterEach(callback),
    routeDone,
    actionDone: ({ type, payload }) => {
      if (type === "email") return { [scene.northpeak]: "send_reply", [scene.saved]: "insert_saved_reply" }[payload.name];
      if (type === "comment" && payload.name === scene.refund) return "post_comment";
      if (type === "assign" && payload.name === scene.refund && payload.add) return "assign";
      if (type === "insert" && payload.doctype === "HD Article") return "save_article";
    },
    showChecklist: () => {
      minimize.value = false;
      showHelpModal.value = true;
    },
  });
}

function stops(): Record<string, Stop> {
  const assignedView = { name: "TicketsAgent", query: { view: ASSIGNED_VIEW } };
  return {
    views: {
      anchors: () => ["menu", `view-${ASSIGNED_VIEW}`],
      showMe: () => router.push(assignedView),
    },
    sla: {
      anchors: () => [`row-${scene.northpeak}`, `sla-${scene.northpeak}`],
      page: {
        go: () => assignedView,
        matches: () => route().name === "TicketsAgent" && route().query.view === ASSIGNED_VIEW,
      },
      showMe: () => router.push(ticketRoute(scene.northpeak)),
    },
    reply: {
      anchors: () => ["reply", "reply-editor"],
      page: ticketPage(() => scene.northpeak),
      showMe: () => reply(scene.northpeak, NORTHPEAK_REPLY),
    },
    sla_met: { anchors: () => ["sla"], page: ticketPage(() => scene.northpeak) },
    saved: {
      anchors: () => ["reply", "saved-replies"],
      page: ticketPage(() => scene.saved),
      showMe: async () => reply(scene.saved, await savedReply("Download invoices")),
    },
    comment: {
      anchors: () => ["comment", "comment-editor"],
      page: ticketPage(() => scene.refund),
      showMe: () => comment(scene.refund, REFUND_APPROVAL),
    },
    assign: {
      anchors: () => ["assign"],
      page: ticketPage(() => scene.refund),
      showMe: () => assign(scene.refund, ANANYA.email),
    },
    kb: {
      anchors: () => ["menu", "nav-AgentKnowledgeBase", "kb-create", "article-create"],
      page: {
        go: () => ticketRoute(scene.euros),
        matches: () => ticketPage(() => scene.euros).matches() || KB_PAGES.includes(String(route().name)),
      },
      showMe: writeArticle,
    },
    portal: {
      anchors: () => ["dock"],
      showMe: async () => location.assign(loginUrl("customer")),
    },
    portal_landed: {
      anchors: () => [`row-${newTicketName()}`, `sla-${newTicketName()}`],
      page: { go: () => ({ name: "TicketsAgent" }), matches: () => route().name === "TicketsAgent" },
    },
    dashboard: {
      anchors: () => ["volume-chart"],
      page: { go: () => ({ name: "Dashboard" }), matches: () => route().name === "Dashboard" },
    },
  };
}

function routeDone() {
  const { name, params, query } = route();
  // a ticket opened from a view keeps the view in its query
  if (name === "TicketAgent") return params.ticketId === scene.northpeak ? "open_northpeak" : undefined;
  if (query.view === ASSIGNED_VIEW) return "open_view";
  if (query.view === RATINGS_VIEW) return "open_rating";
}

// The checklist is frappe's Onboarding, ticked from the tour's state.
function setUpChecklist() {
  const onboarding = useOnboarding(CHECKLIST);
  if (!onboarding) return;
  const resume = () => dockActions.resumeTour?.();
  const extraClicks: Record<string, () => void> = {
    x_rules: () => {
      setActiveSettingsTab("Assignment Rules");
      showSettingsModal.value = true;
    },
    x_csat: () => router.push({ name: "TicketsAgent", query: { view: RATINGS_VIEW } }),
    x_cmdk: openPalette,
  };
  const extraIcons: Record<string, any> = { x_rules: LucideWorkflow, x_csat: LucideStar, x_cmdk: LucideCommand };
  const steps = [
    ...STOP_LABELS.slice(1, STOPS + 1).map((title, i) => ({
      name: `stop_${i + 1}`,
      title,
      completed: false,
      icon: LucideCircleDot,
      onClick: resume,
    })),
    ...EXTRAS.map(({ id, label }) => ({
      name: id,
      title: label,
      completed: false,
      icon: extraIcons[id],
      onClick: () => {
        minimize.value = true;
        extraClicks[id]();
      },
    })),
  ];
  onboarding.setUp(steps);
  // setUp opens the panel; the tour's card comes first, and the dock opens the checklist
  showHelpModal.value = false;
  watch(
    () => [tour.state.stopsDone, tour.state.extrasDone],
    ([stopsDone, extrasDone]) => {
      const done = [...stopsDone.map((stop) => `stop_${stop}`), ...extrasDone];
      steps
        .filter((step) => done.includes(step.name) && !step.completed)
        .forEach((step) => onboarding.updateOnboardingStep(step.name));
    },
    { immediate: true }
  );
}

const NORTHPEAK_REPLY =
  "<p>Hi Daniel,</p><p>Thanks for the detail. We can see card payments failing for several customers, and our payments team is on it now. ACH payments are not affected. I'll update you here within 30 minutes.</p><p>Jamie</p>";
const REFUND_APPROVAL = `<p><span class="mention" data-type="mention" data-id="${ANANYA.email}" data-label="${ANANYA.name}">@${ANANYA.name}</span> Approved. Please go ahead with the $240 refund.</p>`;
const ARTICLE = {
  title: "Invoicing in other currencies",
  content:
    "<p>Fernbill can invoice a client in euros, pounds and 20 other currencies.</p><ol><li>Open the client and click Edit.</li><li>Set Currency, then save.</li></ol><p>Every new invoice for that client uses the currency, and the payment link takes it too. Invoices you already sent keep their currency.</p>",
};

// The same calls the reply, comment and assign controls make, so the fakes record them as a visitor's.
async function reply(ticket: string, message: string) {
  await call("run_doc_method", { dt: "HD Ticket", dn: ticket, method: "reply_via_agent", args: { message } });
  reloadTicketFeed(ticket);
}

async function comment(ticket: string, content: string) {
  await call("run_doc_method", { dt: "HD Ticket", dn: ticket, method: "new_comment", args: { content, attachments: [] } });
  reloadTicketFeed(ticket);
}

async function assign(ticket: string, user: string) {
  await call("frappe.desk.form.assign_to.add", { doctype: "HD Ticket", name: ticket, assign_to: [user] });
  reloadTicket(ticket);
}

async function writeArticle() {
  const category = await call("helpdesk.api.onboarding.get_general_category_id");
  const article = await call("frappe.client.insert", { doc: { doctype: "HD Article", ...ARTICLE, category } });
  await router.push({ name: "Article", params: { articleId: article.name } });
}

async function savedReply(title: string) {
  const reply = await call("frappe.client.get_value", {
    doctype: "HD Saved Reply",
    filters: { title },
    fieldname: "message",
  });
  return reply.message;
}

async function findScenes() {
  const rows = await call("frappe.client.get_list", {
    doctype: "HD Ticket",
    fields: ["name", "subject"],
    filters: [["subject", "in", Object.values(SCENES)]],
    limit_page_length: 0,
  });
  for (const [key, subject] of Object.entries(SCENES)) {
    scene[key as keyof typeof SCENES] = rows.find((row: { subject: string }) => row.subject === subject)?.name ?? "";
  }
}

function route() {
  return router.currentRoute.value;
}

function ticketRoute(ticket: string) {
  return { name: "TicketAgent", params: { ticketId: ticket } };
}

function ticketPage(ticket: () => string) {
  return {
    go: () => ticketRoute(ticket()),
    matches: () => route().name === "TicketAgent" && route().params.ticketId === ticket(),
  };
}
