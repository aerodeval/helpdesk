// Reads that show the overlay. `own` answers for a doc only the overlay has (a passthrough would
// 404); `merge` patches the server's answer. Overlay rows go on the first page only.
import { conditions, matches, type Doc, type Filters } from "./filters";
import { overlay } from "./overlay";
import { assignees, docKey, editedFirst, type Activity } from "./replay";
import { agents, callServer, jsonParam } from "./server";
import { sessionUser } from "./session";

type Read = { own?: (params: Doc) => unknown; merge?: (message: any, params: Doc) => unknown };

const TICKET = "HD Ticket";
const ARTICLE = "HD Article";
const OVERLAID = [TICKET, ARTICLE];
const API = "helpdesk.helpdesk.doctype.hd_ticket.api";
const isNewTicket = (name: unknown) => overlay.isNew(TICKET, name);
const ownTicket = (answer: (params: Doc) => unknown): Read => ({
  own: (params) => (isNewTicket(params.ticket) ? answer(params) : undefined),
});
const noTimeline = { activities: [], has_more_emails: false, has_more_milestones: false, next_milestone_start: 0 };

export const reads: Record<string, Read> = {
  "frappe.client.get": {
    own: ({ doctype, name }) => (overlay.isNew(doctype, name) ? overlay.merge(doctype, { name }) : undefined),
    merge: (doc, { doctype }) => (OVERLAID.includes(doctype) ? overlay.merge(doctype, doc) : doc),
  },
  "helpdesk.api.doc.get_list_data": { merge: listData },
  "helpdesk.api.doc.get_grouped_list": { merge: groupedList },
  "frappe.client.get_list": { merge: plainList },
  "frappe.client.get_count": { merge: count },
  "frappe.desk.form.activity.get_activity_timeline": {
    own: (params) => (params.doctype === TICKET && isNewTicket(params.name) ? timeline(noTimeline, params) : undefined),
    merge: timeline,
  },
  [`${API}.get_ticket_assignees`]: {
    own: (params) => (isNewTicket(params.ticket) ? assigned([], params) : undefined),
    merge: assigned,
  },
  [`${API}.get_one`]: { own: newTicketPage, merge: (ticket, { name }) => ticketPage(ticket, name) },
  [`${API}.get_timeline_changes`]: {
    own: ({ name }) => (isNewTicket(name) ? statusChanges([], name) : undefined),
    merge: (changes, { name }) => statusChanges(changes, name),
  },
  [`${API}.get_ticket_contact`]: ownTicket(({ ticket }) => contactOf(overlay.merge(TICKET, { name: ticket }))),
  [`${API}.get_recent_similar_tickets`]: ownTicket(() => ({ recent_tickets: [], similar_tickets: [] })),
  [`${API}.get_navigation_tickets`]: ownTicket(({ ticket }) => [ticket]),
  "helpdesk.api.timeline.get_ticket_calls": ownTicket(() => []),
  "helpdesk.api.timeline.get_comment_extras": ownTicket(() => ({ comments: {}, pinned_comments: [] })),
  // the server 404s on a ticket only the overlay has
  "helpdesk.api.ticket_analytics.get_ticket_analytics": ownTicket(({ ticket }) => ({
    has_sla: false,
    timeline: [{ key: "created", state: "done", timestamp: overlay.merge(TICKET, { name: ticket }).creation, badge: null }],
    events: [],
    metrics: { avg_agent_gap: null, avg_customer_gap: null, hold_time: null },
    summary: {
      customer_messages: 0,
      agent_messages: 0,
      internal_comments: 0,
      agents_involved: [],
      churn: { sla_changes: 0, team_changes: 0 },
    },
  })),
  "helpdesk.api.knowledge_base.get_article": { own: article },
  "helpdesk.api.article.get_article_stats": {
    own: ({ article_name }) => (overlay.isNew(ARTICLE, article_name) ? { likes: 0, dislikes: 0, views: 0 } : undefined),
  },
};

async function listData(message: Doc, params: Doc) {
  if (!OVERLAID.includes(params.doctype)) return message;
  let filters = jsonParam(params.filters);
  // as the server applies a default view's filters
  if (params.is_default && isEmpty(filters)) filters = jsonParam(params.default_filters);
  const merged = await mergeRows(params.doctype, message.data, filters, message.rows);
  const byModified = /^`?modified`?\s+desc\b/i.test(String(params.order_by ?? "modified desc").trim());
  const rows = byModified ? editedFirst(overlay.projection, params.doctype, merged.rows) : merged.rows;
  return { ...message, data: rows, total_count: message.total_count + merged.delta, row_count: rows.length };
}

async function plainList(rows: Doc[], params: Doc) {
  const fields: string[] = jsonParam(params.fields) ?? ["name"];
  const firstPage = !Number(params.start ?? params.limit_start ?? 0);
  const plain = fields.every((field) => /^\w+$/.test(field)) && !params.group_by;
  if (!OVERLAID.includes(params.doctype) || !firstPage || !plain) return rows;
  return (await mergeRows(params.doctype, rows, jsonParam(params.filters), fields)).rows;
}

async function count(total: number, { doctype, filters }: Doc) {
  if (!OVERLAID.includes(doctype)) return total;
  const parsed = jsonParam(filters);
  const user = sessionUser().email;
  const changes = await outside(doctype, [], [], parsed);
  return changes.reduce((n, { base, doc }) => n + hits(doc, parsed, user) - hits(base, parsed, user), total);
}

// Moves COUNT aggregates between groups; other aggregates keep the server's values.
async function groupedList(groups: Doc[], params: Doc) {
  const fields: unknown[] = jsonParam(params.fields) ?? [];
  const countKey = (fields.find((f: any) => f?.COUNT) as Doc | undefined)?.as;
  if (!OVERLAID.includes(params.doctype) || !countKey || Number(params.limit_start) > 0) return groups;
  const by: string[] = params.group_by ? String(params.group_by).split(",").map((f) => f.trim()) : [];
  const filters = jsonParam(params.filters);
  const user = sessionUser().email;
  const out = groups.map((group) => ({ ...group }));
  const bump = (doc: Doc, n: number) => {
    let group = out.find((g) => by.every((f) => String(g[f] ?? "") === String(doc[f] ?? "")));
    if (!group && n < 0) return;
    if (!group) out.push((group = { ...Object.fromEntries(by.map((f) => [f, doc[f] ?? null])), [countKey]: 0 }));
    group[countKey] += n;
  };
  for (const { base, doc } of await outside(params.doctype, [], by, filters)) {
    if (hits(base, filters, user)) bump(base!, -1);
    if (hits(doc, filters, user)) bump(doc, 1);
  }
  return out.filter((group) => group[countKey] > 0);
}

// Patches the page's rows, drops those that stop matching, and puts new matches on top.
async function mergeRows(doctype: string, rows: Doc[], filters: Filters, fields: string[]) {
  const user = sessionUser().email;
  const pick = (doc: Doc, keys: string[]) => Object.fromEntries(keys.map((key) => [key, doc[key] ?? null]));
  // The server already matched these, so only a loaded field can unmatch them: a filter on a
  // column the view hides, or an operator we cannot evaluate, keeps the row.
  const stillMatches = (doc: Doc) => matches(doc, conditions(filters).filter(([field]) => field in doc), user, true);
  const kept = rows
    .filter((row) => !overlay.touched(doctype, row.name) || stillMatches(overlay.merge(doctype, row)))
    .map((row) => (overlay.touched(doctype, row.name) ? pick(overlay.merge(doctype, row), Object.keys(row)) : row));
  const changes = await outside(doctype, rows.map((row) => String(row.name)), fields, filters);
  const added = changes
    .filter(({ doc }) => matches(doc, filters, user))
    .map(({ doc }) => pick(doc, fields))
    .sort((a, b) => String(b.modified).localeCompare(String(a.modified)));
  const moved = changes.reduce((n, { base, doc }) => n + hits(doc, filters, user) - hits(base, filters, user), 0);
  return { rows: [...added, ...kept], delta: moved - (rows.length - kept.length) };
}

// Overlay docs not on the page, with the seed row each started from (`base` is null for new docs).
async function outside(doctype: string, onPage: string[], fields: string[], filters: Filters) {
  const names = overlay.touchedNames(doctype).filter((name) => !onPage.includes(name));
  const seed = names.filter((name) => !overlay.isNew(doctype, name));
  const wanted = new Set([...fields, ...conditions(filters).map(([field]) => field), "name", "modified", "_assign"]);
  const bases: Doc[] = seed.length
    ? await callServer("frappe.client.get_list", {
        doctype,
        fields: [...wanted].filter((field) => !field.startsWith("__")),
        filters: [["name", "in", seed]],
        limit_page_length: seed.length,
      }).catch(() => [])
    : [];
  return [
    ...bases.map((base) => ({ base: base as Doc | null, doc: overlay.merge(doctype, base) })),
    ...names.filter((name) => overlay.isNew(doctype, name)).map((name) => ({ base: null, doc: overlay.merge(doctype, { name }) })),
  ];
}

function timeline(message: Doc, { doctype, name, visible_types }: Doc) {
  if (doctype !== TICKET) return message;
  const visible: (string | Doc)[] | null = jsonParam(visible_types) || null;
  const types = visible && new Set(visible.flatMap((entry) => (typeof entry === "string" ? [entry] : Object.keys(entry))));
  const versionFields: string[] | undefined = visible?.find((entry): entry is Doc => typeof entry !== "string" && "version" in entry)?.version;
  const rows = rowsOf(name).filter(
    (row) => (!types || types.has(row.type)) && (row.type !== "version" || !versionFields || versionFields.includes(row.data.fieldname))
  );
  const activities = [...message.activities, ...rows].sort((a, b) => `${a.timestamp}${a.key}`.localeCompare(`${b.timestamp}${b.key}`));
  return { ...message, activities };
}

async function assigned(list: Doc[], { ticket }: Doc) {
  const delta = overlay.projection.assigns.get(docKey(TICKET, ticket));
  if (!delta) return list;
  const details = await agents();
  return assignees(JSON.stringify(list.map((a) => a.name)), delta).map(
    (user) => list.find((a) => a.name === user) ?? details[user] ?? { name: user }
  );
}

function ticketPage(ticket: Doc, name: string) {
  const comms = communications(name);
  return {
    ...overlay.merge(TICKET, ticket),
    communications: [...ticket.communications, ...comms],
    has_agent_replied: ticket.has_agent_replied || comms.some((c) => c.is_agent),
  };
}

// The template and form script are the same for every ticket, so any real one lends them.
async function newTicketPage({ name }: Doc) {
  if (!isNewTicket(name)) return undefined;
  const [latest] = await callServer("frappe.client.get_list", { doctype: TICKET, order_by: "creation desc", limit_page_length: 1 }).catch(() => []);
  const lender = latest ? await callServer(`${API}.get_one`, { name: latest.name }).catch(() => null) : null;
  const doc = overlay.merge(TICKET, { name });
  return {
    ...ticketPage({ ...doc, communications: [], has_agent_replied: false }, name),
    assigned_on: null,
    contact: contactOf(doc),
    customer_image: null,
    outside_hours_banner: null,
    overdue_by: {},
    template: lender?.template ?? { fields: [] },
    _form_script: lender?._form_script ?? null,
  };
}

function communications(ticket: string) {
  return rowsOf(ticket)
    .filter((row) => row.type === "email")
    .map(({ data, timestamp, author }) => ({
      name: data.name,
      subject: data.subject,
      content: data.content,
      sender: data.sender,
      creation: timestamp,
      communication_date: timestamp,
      delivery_status: data.deliveryStatus,
      sent_or_received: data.sent_or_received,
      attachments: data.attachments,
      user: { name: author.fullname, image: author.image },
      is_agent: data.sent_or_received === "Sent",
    }));
}

function statusChanges(changes: Doc[], ticket: string) {
  const overlaid = rowsOf(ticket)
    .filter((row) => row.type === "version" && row.data.fieldname === "status")
    .map(({ data, author, timestamp }) => ({
      field: "status",
      from: data.from ?? null,
      to: data.to,
      by: { name: author.fullname, image: author.image },
      on: timestamp,
    }));
  return [...changes, ...overlaid];
}

function article({ name }: Doc) {
  const articleName = String(name).split("-")[0];
  if (!overlay.isNew(ARTICLE, articleName)) return undefined;
  const doc = overlay.merge(ARTICLE, { name: articleName });
  const user = sessionUser();
  return {
    ...doc,
    author: { name: user.fullname, image: user.image },
    title_slug: String(doc.title).toLowerCase().replace(/\W+/g, "-"),
    feedback: 0,
    minutes: 1,
  };
}

function contactOf(ticket: Doc) {
  const email = ticket.raised_by;
  return { email_id: email, name: String(email ?? "").split("@")[0], phone: "", mobile_no: "", image: "" };
}

function rowsOf(ticket: unknown): Activity[] {
  return overlay.projection.timeline.get(String(ticket)) ?? [];
}

const hits = (doc: Doc | null, filters: Filters, user: string) => Number(Boolean(doc) && matches(doc!, filters, user));

function isEmpty(filters: unknown) {
  return !filters || (Array.isArray(filters) ? !filters.length : !Object.keys(filters).length);
}
