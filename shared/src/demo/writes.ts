// Fakes for the Simulated Actions and the writes that fire on page load. Each answers with the
// envelope the real endpoint returns: `{message}`, or `{message, docs}` for `run_doc_method`.
import type { Doc } from "./filters";
import { overlay } from "./overlay";
import { categoryFields, siteTime, slaTargets } from "./replay";
import { agents, callServer, jsonParam, statusCategories } from "./server";
import { demoBoot, emitLocal, randomName, sessionUser, siteTimezone } from "./session";

export const BLOCKED = Symbol("blocked");
type Body = { message: unknown; docs?: Doc[] } | typeof BLOCKED;
type Fake = (params: Doc) => Body | Promise<Body>;

const TICKET = "HD Ticket";
// BulkEditModal waits for a `progress` event from this many tickets up
const BACKGROUND_THRESHOLD = 20;
const SAVED_REPLY_FIELDS: Record<string, string> = {
  "Set Status": "status",
  "Set Priority": "priority",
  "Set Team": "agent_group",
  "Set Ticket Type": "ticket_type",
};

const DOC_METHODS: Record<string, (ticket: string, args: Doc) => Promise<Body>> = {
  mark_seen: async (ticket) => ({ message: 0, docs: [await overlay.doc(TICKET, ticket)] }),
  reply_via_agent: reply,
  new_comment: async (ticket, args) => {
    const name = await comment(ticket, args.content, args.attachments);
    return { message: name, docs: [await overlay.doc(TICKET, ticket)] };
  },
  create_communication_via_contact: customerReply,
};

const done = () => ({ message: null });

export const writes: Record<string, Fake> = {
  run_doc_method: ({ dt, dn, method, args }) =>
    dt === TICKET && DOC_METHODS[method] ? DOC_METHODS[method](String(dn), jsonParam(args) ?? {}) : BLOCKED,
  "frappe.client.set_value": setValue,
  "frappe.client.insert": insertArticle,
  "frappe.desk.form.assign_to.add": async ({ doctype, name, assign_to }) => {
    if (doctype !== TICKET) return BLOCKED;
    await assign(String(name), jsonParam(assign_to), []);
    const assigned: string[] = JSON.parse((await overlay.doc(TICKET, String(name)))._assign || "[]");
    return { message: assigned.map((owner) => ({ owner, name: randomName() })) };
  },
  "helpdesk.api.doc.remove_assignments": async ({ doctype, name, assignees }) => {
    if (doctype !== TICKET) return BLOCKED;
    await assign(String(name), [], jsonParam(assignees));
    return done();
  },
  "frappe.desk.form.assign_to.add_multiple": async ({ doctype, name, assign_to }) => {
    if (doctype !== TICKET) return BLOCKED;
    for (const ticket of jsonParam(name)) await assign(String(ticket), jsonParam(assign_to), [], false);
    return done();
  },
  "frappe.desk.doctype.bulk_update.bulk_update.submit_cancel_or_update_docs": bulkUpdate,
  "helpdesk.api.saved_replies.apply_saved_reply_actions": applySavedReplyActions,
  "helpdesk.helpdesk.doctype.hd_ticket.api.new": newTicket,
  "helpdesk.api.knowledge_base.increment_views": done,
  "frappe.onboarding.update_user_onboarding_status": done,
  // ponytail: read state is not kept, so a reload shows the notification unread again
  "frappe.desk.doctype.notification_log.notification_log.mark_as_read": done,
  "frappe.desk.doctype.notification_log.notification_log.mark_all_as_read": done,
  "helpdesk.api.onboarding.mark_persona_captured": done,
};

async function reply(ticket: string, args: Doc): Promise<Body> {
  const doc = await overlay.doc(TICKET, ticket);
  const s = demoBoot()!.settings;
  const now = new Date().toISOString();
  const fields: Doc = { first_responded_on: doc.first_responded_on || now, last_agent_response: now };
  if (s.auto_update_status && s.update_status_to) fields.status = s.update_status_to;
  if (doc.agreement_status === "First Response Due") fields.agreement_status = "Resolution Due";
  if (fields.status) Object.assign(fields, await statusFields(doc, fields.status));
  const email = emailOf(doc, args.message, args.attachments, "Sent");
  await overlay.record("email", { name: ticket, fields, email: { ...email, to: args.to, cc: args.cc, bcc: args.bcc } });
  ticketUpdated(ticket);
  return { message: email.name, docs: [await overlay.doc(TICKET, ticket)] };
}

async function customerReply(ticket: string, args: Doc): Promise<Body> {
  const doc = await overlay.doc(TICKET, ticket);
  const status = demoBoot()!.settings.ticket_reopen_status || "Open";
  const fields = { status, last_customer_response: new Date().toISOString(), ...(await statusFields(doc, status)) };
  await overlay.record("email", { name: ticket, fields, email: emailOf(doc, args.message, args.attachments, "Received") });
  ticketUpdated(ticket);
  return { message: null, docs: [await overlay.doc(TICKET, ticket)] };
}

// A message moves status and SLA server-side; the ticket page reloads on the server's event
function ticketUpdated(ticket: string) {
  emitLocal("helpdesk:ticket-update", { ticket_id: ticket });
}

async function comment(ticket: string, content: string, attachments: string[] = []) {
  const name = randomName();
  await overlay.record("comment", { name: ticket, comment: { name, content, attachments }, by: sessionUser() });
  return name;
}

// One action per user, as the server logs one row per ToDo.
async function assign(ticket: string, add: string[], remove: string[], live = true) {
  const by = sessionUser();
  const names = await agents();
  for (const user of [...add, ...remove]) {
    const assignee = names[user]?.agent_name ?? user;
    const added = add.includes(user);
    const text = added ? `${by.fullname} assigned ${assignee}` : `Assignment of ${assignee} removed by ${by.fullname}`;
    const action = await overlay.record("assign", { name: ticket, [added ? "add" : "remove"]: [user], by, text, assignee });
    // AssignTo does not reload the feed; the server's row arrives as `docinfo_update`
    if (!live) continue;
    emitLocal("docinfo_update", {
      key: "assignment_logs",
      action: "add",
      doc: {
        reference_doctype: TICKET,
        reference_name: ticket,
        name: action.id,
        creation: siteTime(action.at, siteTimezone()),
        owner: by.email,
        comment_type: added ? "Assigned" : "Assignment Completed",
        content: text,
      },
    });
  }
}

async function setValue({ doctype, name, fieldname, value }: Doc): Promise<Body> {
  const fields = typeof fieldname === "string" && !fieldname.startsWith("{") ? { [fieldname]: value } : jsonParam(fieldname);
  // a published draft would need every portal KB read synthesized
  const allowed = doctype === TICKET || (doctype === "HD Article" && overlay.isNew(doctype, name) && fields.status !== "Published");
  if (!allowed) return BLOCKED;
  await setFields(doctype, await overlay.doc(doctype, String(name)), fields);
  return { message: await overlay.doc(doctype, String(name)) };
}

async function setFields(doctype: string, doc: Doc, fields: Doc) {
  const from = Object.fromEntries(Object.keys(fields).map((field) => [field, doc[field]]));
  const derived = doctype === TICKET && fields.status ? await statusFields(doc, fields.status) : {};
  return overlay.record("set", { doctype, name: String(doc.name), fields, derived, from, by: sessionUser() });
}

// Kept out of `fields`, which become the activity's change rows.
async function statusFields(doc: Doc, status: string): Promise<Doc> {
  const category = (await statusCategories())[status];
  return category ? categoryFields(doc, category, new Date()) : {};
}

async function bulkUpdate({ doctype, docnames, action, data, task_id }: Doc): Promise<Body> {
  if (doctype !== TICKET || action !== "update") return BLOCKED;
  const names: string[] = jsonParam(docnames).map(String);
  const fields = jsonParam(data);
  const rows = await callServer("frappe.client.get_list", {
    doctype,
    fields: ["name", ...Object.keys(fields)],
    filters: [["name", "in", names]],
    limit_page_length: names.length,
  });
  for (const row of rows) await setFields(doctype, overlay.merge(doctype, row), fields);
  if (names.length < BACKGROUND_THRESHOLD) return { message: [] };
  // after the modal has stored the pending task
  setTimeout(() => emitLocal("progress", { percent: 100, task_id }), 100);
  return done();
}

async function applySavedReplyActions({ ticket_id, actions }: Doc): Promise<Body> {
  const ticket = String(ticket_id);
  const applied: Doc[] = [];
  const skipped: Doc[] = [];
  const fields: Doc = {};
  for (const action of jsonParam(actions) as Doc[]) {
    const { action_type: type, value } = action;
    if (SAVED_REPLY_FIELDS[type]) fields[SAVED_REPLY_FIELDS[type]] = value;
    else if (type === "Assign Agent") await assign(ticket, [value], []);
    else if (type === "Assign to Me") await assign(ticket, [sessionUser().email], []);
    else if (type === "Add Comment") await comment(ticket, value);
    // tags are not simulated
    else {
      skipped.push(action);
      continue;
    }
    applied.push(action);
  }
  if (Object.keys(fields).length) await setFields(TICKET, await overlay.doc(TICKET, ticket), fields);
  return { message: { applied, skipped } };
}

async function insertArticle({ doc }: Doc): Promise<Body> {
  const article = jsonParam(doc);
  if (article.doctype !== "HD Article") return BLOCKED;
  const user = sessionUser().email;
  const category = await callServer("frappe.client.get_value", {
    doctype: "HD Article Category",
    filters: article.category,
    fieldname: "category_name",
  }).catch(() => null);
  const name = randomName();
  await overlay.record("insert", {
    doctype: "HD Article",
    doc: { ...article, name, status: "Draft", author: user, owner: user, modified_by: user, views: 0, category_name: category?.category_name },
  });
  return { message: await overlay.doc("HD Article", name) };
}

// A customer's customer, contact and team come from their latest ticket; an agent's ticket has
// none of these. The SLA its customer maps to and the SLA times come from the boot, as customers
// cannot read SLAs.
async function newTicket({ doc, attachments }: Doc): Promise<Body> {
  const fields = jsonParam(doc);
  const user = sessionUser();
  const { settings: s, slas, customer_slas, persona } = demoBoot()!;
  const [latest] = persona === "agent" ? [{}] : await callServer("frappe.client.get_list", {
    doctype: TICKET,
    fields: ["customer", "contact", "agent_group"],
    order_by: "creation desc",
    limit_page_length: 1,
  }).catch(() => [{}]);
  const customer = fields.customer || latest?.customer || null;
  const sla = customer_slas[customer ?? ""] ?? null;
  const priority = fields.priority || s.default_priority || "Medium";
  const now = Date.now();
  const name = overlay.nextTicketName();
  const ticket = {
    ...fields,
    doctype: TICKET,
    name,
    status: s.default_ticket_status || "Open",
    priority,
    agent_group: fields.agent_group || latest?.agent_group || null,
    customer,
    contact: latest?.contact || null,
    sla,
    agreement_status: sla ? "First Response Due" : null,
    service_level_agreement_creation: new Date(now).toISOString(),
    ...slaTargets((sla && slas[sla]) || [], priority, now),
    raised_by: user.email,
    owner: user.email,
    via_customer_portal: 1,
    _assign: "[]",
  };
  const files = (jsonParam(attachments) ?? []).map((file: Doc) => file.name);
  await overlay.record("insert", { doctype: TICKET, doc: ticket, email: emailOf(ticket, fields.description, files, "Received") });
  return { message: await overlay.doc(TICKET, name) };
}

function emailOf(ticket: Doc, content: string, attachments: string[] = [], direction: "Sent" | "Received") {
  const by = sessionUser();
  return {
    name: randomName(),
    subject: ticket.subject,
    sender: by.email,
    content,
    deliveryStatus: direction === "Sent" ? "Sent" : "",
    sent_or_received: direction,
    attachments,
    by,
  };
}
