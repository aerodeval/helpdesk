// Self-check for the filter evaluator and replay: `node shared/src/demo/check.ts`
import assert from "node:assert/strict";
import { matches } from "./filters.ts";
import { categoryFields, docKey, editedFirst, patched, replay, siteTime, slaTargets, type Action } from "./replay.ts";

const me = "jamie@fernbill.example";
const ticket = { name: "12", status: "Open", priority: "High", agent_group: "", _assign: `["${me}"]` };

assert.ok(matches(ticket, { status: "Open" }, me));
assert.ok(matches(ticket, [["HD Ticket", "status", "!=", "Closed"]], me));
assert.ok(matches(ticket, [["priority", "in", ["High", "Urgent"]]], me));
assert.ok(matches(ticket, [["priority", "not in", "Low, Medium"]], me));
assert.ok(matches(ticket, { _assign: ["like", "%@me%"] }, me));
assert.ok(matches(ticket, [["agent_group", "is", "not set"]], me));
assert.ok(!matches(ticket, [["priority", "is", "not set"]], me));
assert.ok(!matches(ticket, [["status", "=", "Resolved"]], me));
assert.ok(!matches(ticket, [["creation", ">", "2020-01-01"]], me), "unknown operator excludes");
assert.ok(matches(ticket, [["creation", ">", "2020-01-01"], ["status", "=", "Open"]], me, true), "a row the server matched stays");
assert.ok(matches(ticket, null, me));

const at = (minute: number) => `2026-10-26T10:0${minute}:00.000Z`;
const by = { email: me, fullname: "Jamie Rivera", image: null };
const log: Action[] = [
  { id: "a1", type: "insert", at: at(1), payload: { doctype: "HD Ticket", doc: { name: "201", status: "Open" }, email: { name: "c1", content: "Hi", by } } },
  { id: "a2", type: "set", at: at(2), payload: { doctype: "HD Ticket", name: "12", fields: { status: "Resolved" }, from: { status: "Open" }, by } },
  { id: "a3", type: "assign", at: at(3), payload: { name: "12", add: ["alex@fernbill.example"], by, text: "assigned" } },
  { id: "a4", type: "assign", at: at(4), payload: { name: "12", remove: [me], by, text: "removed" } },
  { id: "a5", type: "file", at: at(5), payload: { name: "f1", file_name: "a.txt", blob: new Blob(["x"]) } },
  { id: "a6", type: "email", at: at(6), payload: { name: "12", fields: { last_agent_response: at(6) }, email: { name: "c2", content: "Done", by, attachments: ["f1"] } } },
];
const p = replay(log, "Asia/Kolkata");

assert.equal(siteTime(at(1), "Asia/Kolkata"), "2026-10-26 15:31:00.000000");
assert.equal(p.docs.get(docKey("HD Ticket", "201"))?.__new, 1);
const seed = patched(p, "HD Ticket", ticket);
assert.equal(seed.status, "Resolved");
assert.equal(seed.last_agent_response, "2026-10-26 15:36:00.000000");
assert.deepEqual(JSON.parse(seed._assign), ["alex@fernbill.example"]);
assert.ok(!matches(seed, { status: "Open" }, me), "a resolved ticket leaves the Open view");
assert.deepEqual(
  p.timeline.get("12")?.map((row) => row.key),
  ["version:a2-0", "log:a3", "log:a4", "email:c2"]
);
assert.equal(p.timeline.get("12")?.at(-1)?.data.attachments[0].file_name, "a.txt");
assert.equal(p.timeline.get("201")?.[0]?.key, "email:c1");

const priorities = [{ priority: "Urgent", response_time: 3600, resolution_time: 28800 }];
assert.deepEqual(slaTargets(priorities, "Urgent", Date.parse(at(0))), {
  response_by: "2026-10-26T11:00:00.000Z",
  resolution_by: "2026-10-26T18:00:00.000Z",
});
assert.deepEqual(slaTargets(priorities, "Low", Date.parse(at(0))), { response_by: null, resolution_by: null }, "no row for the priority");

assert.deepEqual(
  editedFirst(p, "HD Ticket", [{ name: "13" }, { name: "12" }, { name: "11" }]).map((row) => row.name),
  ["12", "13", "11"],
  "an edited row goes to the top of a modified list"
);

const now = new Date(at(0));
const due = { status_category: "Open", agreement_status: "Resolution Due", first_responded_on: at(0) };
const held = categoryFields(due, "Paused", now);
assert.equal(held.on_hold_since, now.toISOString(), "a reply puts the ticket on hold");
assert.equal(held.agreement_status, "Paused");
const resumed = categoryFields({ ...due, ...held }, "Open", now);
assert.equal(resumed.on_hold_since, null);
assert.equal(resumed.agreement_status, "Resolution Due");
assert.equal(categoryFields({ ...due, agreement_status: "Failed" }, "Paused", now).agreement_status, undefined, "failed stays failed");
assert.deepEqual(categoryFields(due, "Open", now), {}, "same category");

console.log("demo check passed");
