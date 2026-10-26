# Fernbill Seed Data

This folder is the Seed Data for the Helpdesk live demo. Fernbill is a fictional invoicing and billing app for small businesses. The data is its help desk: six agents in three teams, 40 customer organisations, 70 contacts, 3 SLAs, 25 knowledge base articles, 8 saved replies and 200 tickets over 60 days.

The replay in `helpdesk/demo/replay.py` loads this folder. `helpdesk/demo/fixture.py` reads it.

## Files

| File | Contents |
| --- | --- |
| `meta.json` | `{"seed_version": "...", "personas": {"agent": "jamie@fernbill.example", "customer": "priya@greenleaf-studio.example"}}` |
| `sla.json` | 3 `HD Service Level Agreement`: Starter (default), Growth, Enterprise |
| `agents.json` | 6 `User`, then 6 `HD Agent`, then 3 `HD Team` |
| `customers.json` | 40 `HD Customer` |
| `contacts.json` | 70 `Contact`, then 70 `User` (Website User), one per contact |
| `kb.json` | 6 `HD Article Category`, then 25 `HD Article` |
| `saved_replies.json` | 8 `HD Saved Reply` |
| `tickets.json` | 200 `HD Ticket`, oldest first, each with its `thread` |
| `settings.json` | `HD Settings` values: the Fernbill name, logo and ticket defaults. The replay saves them before it inserts anything. |
| `_build/` | The hand-written sources, the build script and the validator |

Each entity file is a list of Frappe documents. Each document has its `doctype`. The replay inserts them in this order: sla, agents, customers, contacts, kb, saved_replies, tickets. Inside a file, documents are inserted in the order they appear, so a `User` comes before the `HD Agent` that links to it.

Contacts come before their users. When a `User` is inserted, Frappe looks for a `Contact` with the same email and creates one only if there is none.

## Times

All times are offsets from an anchor `T`. The replay sets `T` to the time it runs.

- Grammar: `T`, or `T`, a sign (`+` or `-`), then one or more parts of a number and a unit. The units are `d` (days), `h` (hours), `m` (minutes) and `s` (seconds). The regular expression is `^T(?:[+-](?:\d+[dhms])+)?$`.
- Examples: `T`, `T-3d4h`, `T-45m`, `T+30m`.
- Any Date or Datetime field can be an offset, and so can `creation`. In this fixture that is `creation` on tickets, `published_on` on articles, `at` on thread events, and `response_by` on one ticket.
- Every ticket's `creation` and every event's `at` are at or before `T`. Only `response_by` is in the future.

The date-shift job in `helpdesk/demo/date_shift.py` moves all seeded times forward every 10 minutes, so the data stays as fresh as when it was replayed.

## Tickets

A ticket document holds the `HD Ticket` fields: `subject`, `raised_by`, `customer`, `description`, `priority`, `ticket_type`, `agent_group`, `via_customer_portal` and `creation`. The `description` is the customer's first message. Inserting the ticket turns it into the first message of the conversation.

`thread` is a list of events in time order. The replay runs each one at the real time and then moves what it wrote to `at`.

| `type` | Keys | What the replay calls |
| --- | --- | --- |
| `reply` | `by` (agent), `content` (HTML) | `ticket.reply_via_agent` |
| `customer_reply` | `by` (contact), `content` (HTML) | `ticket.create_communication_via_contact` |
| `comment` | `by` (agent), `content` (HTML) | `ticket.new_comment` |
| `assign` | `by` (agent), `to` (agent) | `ticket.assign_agent` |
| `update` | `by`, `values` | `ticket.update(values).save()` |

- Status changes come from the events. An agent reply sets Replied, and a customer reply sets Open. The thread has an `update` event only to resolve or close a ticket: `{"status": "Resolved"}` or `{"status": "Closed"}`. Tickets that ended more than 10 days before `T` are Closed. The rest are Resolved.
- The CSAT rating is an `update` by the contact: `{"feedback": "<label>", "feedback_extra": "<comment>"}`. The label is one of the default `HD Ticket Feedback Option` labels, and Helpdesk takes the rating from it: 1 star is "Response did not help", 2 is "Delayed response time", 3 is "Clear guidance given", 4 is "Prompt, informative support", 5 is "Exceptional support experience".
- A ticket has at most one `assign` event, for its final assignee. Unassigned tickets have none.
- Comments that mention an agent contain the mention span from the agent editor: `<span class="mention" data-type="mention" data-id="jamie@fernbill.example" data-label="Jamie Rivera">@Jamie Rivera</span>`.
- `response_by` (and `resolution_by`) pin the SLA target. Only the Northpeak ticket pins one: `T+30m`. All other SLA dates are recomputed from `creation`.
- The keys `theme`, `plan`, `final_status` and `scene` are fixture metadata for the validator and for people reading the file. They are not `HD Ticket` fields, and the insert ignores them.

Ticket names are numbered in insert order, so the newest seeded ticket is #200 and the first ticket a visitor raises is #201.

## Scene Tickets

The guided tour depends on these tickets. Their subjects must not change. Each has a `scene` key.

| `scene` | Subject | State |
| --- | --- | --- |
| `sla-breach` | Card payments failing for all our customers since this morning | Northpeak Logistics, Enterprise, Urgent, opened at `T-30m`, first response due `T+30m`, assigned to Jamie, no reply yet |
| `saved-reply` | How do I download past invoices? | Open, assigned to Jamie. The saved reply "Download invoices" answers it. |
| `refund-approval` | Refund for a double charge | Ananya comments to @Jamie for approval of a $240 refund, then hands the ticket to Jamie |
| `kb-gap` | Can I invoice in euros? | Open, assigned to Jamie. No article covers multi-currency invoices. |
| `portal-awaiting` | Late fee added to an invoice with late fees turned off | Priya's ticket, waiting for an agent reply |
| `portal-replied` | Client portal shows our old logo | Priya's ticket, Sofia replied about 25 minutes before `T` |
| `portal-resolved` | Adding a second admin to our account | Priya's ticket, Resolved, rated 5 |

Jamie is assigned 8 open or replied tickets: the four scenes above that name Jamie, plus Brightwater (API rate limits), Castellan (SOC 2 report), Ostara (renewal quote) and Kitewing (tax rounding).

## The mix

- Themes: Billing 70, Integrations 40, Bugs 30, How-to 30, Account/SSO 20, Feature requests 10.
- Status: 25 Open, 30 Replied, the rest Resolved or Closed.
- Volume: about 2 tickets a day until the v3 release at `T-7d`, then about 13 a day. Many tickets after the release are about v3 changes.
- CSAT: 84 ratings with an average of 4.4.
- Plans: 5 Enterprise, 15 Growth, 20 Starter. Each plan has its own SLA. Support runs every day, around the clock, so SLA targets do not depend on the time of day of the anchor.
- Email addresses: agents use `@fernbill.example`, and customers use `@<org-slug>.example`.

## Authoring sources

The JSON files are generated. Edit the sources in `_build/` and run the build:

```sh
python3 helpdesk/demo/fixture/_build/build.py
python3 helpdesk/demo/fixture/_build/validate.py
```

- `orgs.txt`: one customer per line: `plan|name|industry|country|contacts`. Contacts are `First Last:Title`, separated by `;`.
- `threads/*.txt`: tickets. A ticket starts with a header and a subject line:

  ```
  == <theme> | <org-slug>/<contact first name> | <priority> | <Open|Replied|Done> | key=value ...
  # Subject
  C: first message from the customer
  A <agent>: agent reply
  N <agent>: internal comment
  C <first name>: a message from another contact at the same customer
  @ <agent>
  ```

  A message continues until the next marker. A marker can take a gap after the name, for example `A sofia +2h:`, otherwise the build picks a realistic gap. `@ <agent>` hands the ticket to that agent. Header keys: `to=` (assignee, default the first agent who replies, `none` for no one), `type=`, `team=`, `at=` (exact creation offset), `v3` (opened after the v3 release), `portal`, `rate=1..5`, `note="rating comment"`, `scene=`, `response_by=`.
  Times are placed by the build. Open and Replied tickets are laid out backwards from `T`. Done tickets are spread over the 60 days, with more of them after the v3 release.
- `kb.txt`: `== category | title | author | published_on`, then the article. Blank lines separate paragraphs. Lines that start with `- ` or `1. ` become lists, and `## ` starts a heading.
- `saved_replies.txt`: `== title | scope | team ...`, then the message.

The validator checks the replay contract (document types per file, offset grammar, event shapes, every event at or before `T`), references between files (contacts, customers, agents, teams, SLA conditions, KB categories, feedback labels), the counts above, the Scene Tickets, and the copy rules: no em dash, no banned phrases, and at most 5 exclamation marks.

## Agent avatars

The six agents' `User` and `HD Agent` records point at `/assets/helpdesk/demo/<first>-<last>.svg`, for example `jamie-rivera.svg`. The files are in `helpdesk/public/demo/`. The replay publishes each one as a public `File` and points the records at its `/files/...` URL, so the images load even where the bench has not built this app's assets.

Avatars: DiceBear Notionists (https://www.dicebear.com/styles/notionists/), a remix of Notionists by Zoish, CC0 1.0. Generated with seed = file name.

The Fernbill leaf mark is `helpdesk/public/demo/fernbill-logo.svg`. It was drawn for this demo.
