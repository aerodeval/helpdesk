// The action log replayed into what reads merge in. Pure, so check.ts can run it in node.
// Row text is English: the demo is not translated (map #51, out of scope).
import type { Doc } from "./filters";

export type ActionType = "insert" | "set" | "email" | "comment" | "assign" | "file";
export interface Action {
  id: string;
  type: ActionType;
  // UTC ISO; rendered in the site timezone on replay
  at: string;
  payload: Doc;
}
export interface Activity {
  type: string;
  key: string;
  timestamp: string;
  author: Doc;
  data: Doc;
}
export interface Projection {
  // new docs carry `__new`; seed docs hold only the changed fields
  docs: Map<string, Doc>;
  assigns: Map<string, { added: Set<string>; removed: Set<string> }>;
  timeline: Map<string, Activity[]>;
  files: Map<string, Doc>;
}

const LABELS: Record<string, string> = {
  status: "Status",
  priority: "Priority",
  agent_group: "Team",
  ticket_type: "Ticket Type",
};

export const docKey = (doctype: string, name: unknown) => `${doctype}/${name}`;

export function replay(log: Action[], timezone: string): Projection {
  const p: Projection = { docs: new Map(), assigns: new Map(), timeline: new Map(), files: new Map() };
  for (const action of log) {
    const at = siteTime(action.at, timezone);
    const payload = localize(action.payload, timezone);
    APPLY[action.type](p, { ...action, at, payload });
  }
  return p;
}

export function patched(p: Projection, doctype: string, base: Doc): Doc {
  const { __new, ...own } = p.docs.get(docKey(doctype, base.name)) ?? {};
  const doc = { ...base, ...own };
  const delta = p.assigns.get(docKey(doctype, base.name));
  if (delta) doc._assign = JSON.stringify(assignees(base._assign, delta));
  return doc;
}

export function assignees(_assign: unknown, delta: { added: Set<string>; removed: Set<string> }) {
  const current: string[] = JSON.parse(String(_assign || "[]"));
  const kept = current.filter((user) => !delta.removed.has(user));
  return [...kept, ...[...delta.added].filter((user) => !kept.includes(user))];
}

// Frappe's own datetime format, so overlay rows sort next to Seed Data.
export function siteTime(iso: string, timezone: string): string {
  const date = new Date(iso);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  const micro = String(date.getUTCMilliseconds() * 1000).padStart(6, "0");
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}.${micro}`;
}

// Now plus the SLA's times for the priority, as UTC ISO. Working hours and holidays are left out:
// #55 rules out a full SLA recompute.
export function slaTargets(priorities: Doc[], priority: string, start: number) {
  const row = priorities.find((p) => p.priority === priority);
  const at = (seconds: number | undefined) => (seconds ? new Date(start + seconds * 1000).toISOString() : null);
  return { response_by: at(row?.response_time), resolution_by: at(row?.resolution_time) };
}

const APPLY: Record<ActionType, (p: Projection, a: Action) => void> = {
  insert(p, { at, payload }) {
    const { doctype, doc, email } = payload;
    p.docs.set(docKey(doctype, doc.name), { ...doc, creation: at, modified: at, __new: 1 });
    if (email) addEmail(p, doc.name, at, email);
  },
  set(p, { id, at, payload }) {
    const { doctype, name, fields, derived, from, by } = payload;
    patch(p, doctype, name, { ...fields, ...derived, modified: at });
    if (doctype !== "HD Ticket") return;
    Object.entries(fields).forEach(([fieldname, to], i) => {
      const label = LABELS[fieldname] ?? fieldname;
      const changed = from?.[fieldname] ? { prefix: `changed ${label}`, from: from[fieldname] } : { prefix: `set ${label} to` };
      addRow(p, name, {
        type: "version",
        key: `version:${id}-${i}`,
        timestamp: at,
        author: by,
        data: { name: `${id}-${i}`, fieldname, type: "diff", to, ...changed },
      });
    });
  },
  email(p, { at, payload }) {
    patch(p, "HD Ticket", payload.name, { ...payload.fields, modified: at });
    addEmail(p, payload.name, at, payload.email);
  },
  comment(p, { at, payload }) {
    const { name, comment, by } = payload;
    addRow(p, name, {
      type: "comment",
      key: `comment:${comment.name}`,
      timestamp: at,
      author: by,
      data: { name: comment.name, content: comment.content, attachments: files(p, comment.attachments) },
    });
  },
  assign(p, { id, at, payload }) {
    const { name, add = [], remove = [], by, text, assignee } = payload;
    const key = docKey("HD Ticket", name);
    const delta = p.assigns.get(key) ?? { added: new Set<string>(), removed: new Set<string>() };
    add.forEach((user: string) => (delta.removed.delete(user), delta.added.add(user)));
    remove.forEach((user: string) => (delta.added.delete(user), delta.removed.add(user)));
    p.assigns.set(key, delta);
    addRow(p, name, {
      type: "log",
      key: `log:${id}`,
      timestamp: at,
      author: by,
      data: { name: id, subtype: add.length ? "assigned" : "assignment_completed", text, assignee },
    });
  },
  file(p, { payload }) {
    const { blob, ...file } = payload;
    p.files.set(file.name, { ...file, file_url: URL.createObjectURL(blob) });
  },
};

function patch(p: Projection, doctype: string, name: string, fields: Doc) {
  const key = docKey(doctype, name);
  p.docs.set(key, { ...p.docs.get(key), ...fields });
}

function addEmail(p: Projection, ticket: string, at: string, email: Doc) {
  const { by, attachments, ...data } = email;
  addRow(p, ticket, {
    type: "email",
    key: `email:${email.name}`,
    timestamp: at,
    author: by,
    data: { ...data, attachments: files(p, attachments) },
  });
}

function addRow(p: Projection, ticket: string, row: Activity) {
  p.timeline.set(String(ticket), [...(p.timeline.get(String(ticket)) ?? []), row]);
}

function files(p: Projection, names: string[] = []) {
  return names.map((name) => p.files.get(name)).filter(Boolean) as Doc[];
}

const ISO_UTC = /^\d{4}-\d\d-\d\dT[\d:.]+Z$/;

function localize(value: any, timezone: string): any {
  if (typeof value === "string") return ISO_UTC.test(value) ? siteTime(value, timezone) : value;
  if (Array.isArray(value)) return value.map((v) => localize(v, timezone));
  if (value && value.constructor === Object) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, localize(v, timezone)]));
  }
  return value;
}
