// Self-check for the filter evaluator, the replay and the tour reducer: `node shared/src/demo/check.ts`
import assert from "node:assert/strict";
import { matches } from "./filters.ts";
import { categoryFields, docKey, editedFirst, patched, replay, siteTime, slaTargets, type Action } from "./replay.ts";
import { canGoBack, indexOf, initialState, stepAt, tourReducer, type TourAction, type TourState } from "./tourScript.ts";

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

const run = (state: TourState, ...actions: (TourAction | string)[]) =>
  actions.reduce((s, a) => tourReducer(s, typeof a === "string" ? { type: "DO", what: a } : a), state);
const happy = run(
  initialState(),
  { type: "START" },
  "open_view",
  "filter_list",
  "open_northpeak",
  "send_reply",
  { type: "NEXT" },
  "insert_saved_reply",
  "post_comment",
  "assign",
  "open_notifications",
  { type: "NEXT" },
  "create_ticket",
  { type: "NEXT" },
  "save_article",
  "switch_to_customer",
  "raise_ticket",
  "switch_to_agent",
  { type: "NEXT" },
  { type: "NEXT" }
);
assert.equal(stepAt(happy).id, "end");
assert.equal(happy.tour, "finished_card");
assert.deepEqual([...happy.stopsDone].sort(), [1, 2, 3, 4, 5, 6, 7, 8, 9], "the happy path completes every stop");

const rushed = run(initialState(), { type: "START" }, { type: "NEXT" });
assert.equal(stepAt(rushed).id, "views", "Next waits for the step");
assert.equal(stepAt(run(rushed, { type: "SKIP" })).id, "filter");
assert.ok(!canGoBack(rushed), "Back stops at the welcome card");

const early = run(initialState(), { type: "START" }, "open_view", "switch_to_customer");
assert.equal(early.tour, "paused", "an early persona switch pauses");
const back = run(early, { type: "RESUME" });
assert.equal(back.tour, "running");
assert.equal(back.persona, "agent", "resuming switches the persona back");

const landed = run(initialState(), { type: "START" }, ...["open_view", "filter_list", "open_northpeak", "send_reply"], { type: "NEXT" });
const atPortal = { ...landed, step: indexOf("portal_landed"), persona: "agent" as const };
assert.ok(!canGoBack(atPortal), "Back can't cross a persona switch");

const intro = run(initialState("customer"), { type: "START_INTRO" }, { type: "NEXT" }, "raise_ticket");
assert.equal(stepAt(intro).id, "intro_raise", "the intro waits for its own button after the ticket");
const joined = run(intro, { type: "NEXT" }, "switch_to_agent");
assert.equal(stepAt(joined).id, "portal_landed", "the customer-first entry joins at Already in your inbox");
assert.equal(joined.tour, "running");
assert.deepEqual(joined.stopsDone, [], "joining does not tick the stops the visitor skipped");
const agentSide = run(joined, { type: "NEXT" });
assert.equal(stepAt(agentSide).id, "views", "the customer-first entry goes on to the agent stops");
const customerPath = run(
  agentSide,
  ...["open_view", "filter_list", "open_northpeak", "send_reply"],
  { type: "NEXT" },
  ...["insert_saved_reply", "post_comment", "assign", "open_notifications"],
  { type: "NEXT" },
  "create_ticket",
  { type: "NEXT" },
  "save_article"
);
assert.equal(stepAt(customerPath).id, "dashboard", "it skips the portal stop it started with");
assert.deepEqual([...customerPath.stopsDone].sort(), [1, 2, 3, 4, 5, 6, 7, 8]);

const finished = run(happy, { type: "FINISH" });
const rerun = run(finished, { type: "GOTO", stop: 1 });
assert.equal(stepAt(rerun).id, "views", "a checklist row reruns its stop");
assert.equal(rerun.tour, "running");
assert.equal(stepAt(run(rerun, { type: "NEXT" })).id, "filter", "a rerun stop shows all its steps");
assert.equal(stepAt(run(rerun, { type: "NEXT" }, { type: "NEXT" })).id, "end", "then ends, as the rest is done");

const extras = run(initialState(), { type: "DISMISS" }, "use_cmdk");
assert.deepEqual(extras.extrasDone, ["x_cmdk"]);
assert.equal(run(extras, { type: "RESUME" }).step, indexOf("views"), "resuming a closed welcome starts the tour");

console.log("demo check passed");
