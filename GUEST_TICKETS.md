# Letting anyone raise a ticket

How the knowledge-base portal at `/kb` came to accept tickets from people who are not
signed in — what other help desks do, what the framework already gave us, and what had
to be built.

## What the competition does

Every major help desk answers the same three questions: can a stranger read the
knowledge base, can a stranger open a ticket, and what stops that from becoming a spam
funnel.

| Product | KB readable anonymously | Anonymous ticket submission | What gates it |
|---|---|---|---|
| **Zendesk** | Yes by default; can require sign-in | **Admin Center → People → Configuration → End users → "Anybody can submit tickets"**. Since March 2026 an anonymous request lands as a *suspended ticket* and a verification email goes out; a **"Verify anonymous requests"** checkbox controls it | Email verification, added explicitly to fight spam |
| **Jira Service Management** | Yes, via the login-free portal | **"Customers can access and send requests from the portal without logging in."** The requester still gives an **email address**; the request is created immediately | Requires working outgoing mail. A follow-up email invites them to create an account to track it |
| **Freshdesk** | Yes by default | Open by default; **Admin → Channels → Portals → Settings** can restrict "submit a new ticket" to logged-in users | A per-section portal permission matrix |
| **Zoho Desk** | Configurable per Help Center | An "open" Help Center lets anyone submit and search; you sign in only to **track** a ticket | The "Customers must register to access Help Center" toggle |
| **Help Scout** | Docs site public or private | The Beacon contact form works anonymously; **"Require Email"** can be turned off entirely | Per-Beacon contact settings |

The shape they converge on, and the one adopted here:

> **The knowledge base stays public → a visitor may submit with an email address → they
> sign in only to track the ticket → abuse is held back by rate limiting.**

Zendesk's park-and-verify was considered and rejected for now: it needs a holding
record and a verification route, and frappe has no "suspended ticket" concept to hang
it on. Rate limiting is one decorator. If spam ever becomes real, verification is the
next step, not a rewrite.

## What the framework already had

Almost all of it. The setting was not new work:

| Need | Already there |
|---|---|
| The setting | `allow_anyone_to_create_tickets` on **HD Settings** |
| Admin UI for it | The "Allow anyone to create tickets" switch in the agent desk (`desk/src/components/Settings/General/components/TicketSettings.vue`) |
| Guest permission grant | `set_guest_ticket_creation_permission` / `remove_guest_ticket_creation_permission`, driven from `HDSettings.before_save` |
| Rate limiting | `frappe.rate_limiter.rate_limit` |
| Email validation | `frappe.utils.validate_email_address` |
| Contact lookup by email | `frappe.contacts.doctype.contact.contact.get_contact_name` |
| Ticket defaults (type, priority, status, SLA) | `HD Ticket.before_validate`, already reading HD Settings |
| A guest-readable config endpoint | `helpdesk.api.config.get_config`, already `allow_guest=True` |

What was missing was the wiring: nothing on the portal ever called any of it, and the
portal itself could not render for a signed-out visitor at all.

## The security hole this closes

Turning the setting on used to grant the **Guest** role `read`, `write`, `create` *and*
`if_owner` on HD Ticket. Every guest-created ticket is owned by the literal user
`"Guest"`, so `if_owner` draws no line between one visitor and another: **any anonymous
visitor could read and write every other guest's ticket.**

The grant is now `create` only. Each permission is set explicitly, because
`frappe.permissions.add_permission` seeds a new row with `read` already on — narrowing
the list alone left `read: 1` with no `if_owner` to constrain it, which is strictly
worse. `helpdesk/api/test_ticket.py::test_enabling_it_does_not_expose_other_tickets`
asserts the whole row, not just the one permission being granted.

Nothing needs those permissions: the endpoint validates first and then inserts with
`ignore_permissions=True`.

## What was built

### The endpoint — `helpdesk/api/ticket.py::new_guest_ticket`

```python
@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=5, seconds=60 * 60)
def new_guest_ticket(subject, description, email, first_name=None) -> dict:
```

Deliberately *not* the existing `hd_ticket.api.new`. That one takes a whole document
dict, which an anonymous caller could use to set `status`, `customer`, `agent_group` or
assignment. Four named arguments is the whole attack surface; everything else comes
from the defaults `before_validate` already applies. It:

1. refuses with `PermissionError` unless the HD Settings toggle is on,
2. validates the email and rejects an empty subject or description (description is
   editor HTML, so "empty" is `<p><br></p>`, not `""`),
3. reuses the Contact for that address or creates one — which is what lets the
   requester see the ticket later, once they sign up with the same address,
4. inserts with `raised_by` set to the entered address.

Two defects in the shared ticket lifecycle surfaced on this path and were fixed at the
root rather than worked around:

- `HD Ticket.on_communication_update` called `self.save()` unchecked-for-permission,
  unlike every sibling save in the same path. It now passes `ignore_permissions=True`:
  the permission was asserted when the communication was written, and this is only the
  bookkeeping that follows.
- `create_communication_via_contact` set `c.sender = frappe.session.user`, so a guest's
  opening message would have read as coming from "Guest". It now falls back to
  `raised_by` when there is no session identity.

### Making the portal reachable at all

The published portal rendered a blank page for every signed-out visitor — it had never
worked, so the "Login" button in the topbar had never been reachable by anyone who
needed it. Three framework-level calls in the Studio renderer are closed to guests:

| Call | Fix |
|---|---|
| `studio_page.find_page_with_route` returned only a name, then the renderer fetched the page with `frappe.client.get` | Now `allow_guest=True` and returns the document itself. Unpublished pages, and the draft blocks of published ones, are withheld from anyone without read permission |
| `componentStore.fetchComponent` used `createDocumentResource` on Studio Component | New guest-callable `studio_component.get_component` |
| `codeStore.setPageResources` / `setPageVariables` re-read the page's child tables over `frappe.client.get_list` | They now use the child tables the page document already carries. Only the editor reloads the list resources, because its Data panel binds to them |

The KB's own reads had the same problem: `frappe.client.get_list` and
`frappe.client.get` are not open to guests, so every `Document`/`Document List`
resource on the public pages failed. Four endpoints in
`helpdesk/api/knowledge_base.py` replace them:

`get_public_articles`, `get_public_article`, `get_public_categories`,
`get_public_category` — all `allow_guest=True`, all with **fixed field lists** and a
status filter that is not a parameter, so an anonymous caller can widen neither.

### The portal

- **`studio/helpdesk/stores/session.ts`** (new) — one call to `get_config` answers both
  "am I signed in?" and "may I raise a ticket?". It exposes `isGuest`,
  `canCreateTicket`, `loginUrl` and `accountMenuOptions`. It rides along in
  `useSettingsModal`, which every page script already calls, so no page needed editing.
- **`studio_components/header.json`** — the topbar's right-hand cluster moved here, so
  all five pages share one copy instead of three of them hard-coding a "Login" text
  button. It holds **Raise a ticket** (`{{ canCreateTicket && route.path !== '/new-ticket' }}`)
  and **Login** (`{{ isGuest }}`).
- **`topbar_logo.json`** — the account menu is now bound to `{{ accountMenuOptions }}`:
  a guest sees *Knowledge base* and *Log in*; a signed-in user keeps all five items.
- **`new_ticket`** — guest mode: Name and Email fields shown only to visitors, the
  template-driven fields hidden from them (those can be customer-scoped and cannot be
  validated for an anonymous person), and a confirmation with the ticket ID plus a
  sign-up link replacing the form once it lands.

Three fixes that were previously wrong for everyone came along with this: the login
redirect went to `/helpdesk/home` (the *agent* desk) rather than back to the page being
read; the account menu's "Knowledge base" item did a full page reload instead of a
router push; and nothing anywhere linked to `/new-ticket`.

## Turning it on

Agent desk → **Settings → General → Allow anyone to create tickets**. That single
switch drives everything: the Guest permission grant, whether the endpoint accepts a
request, and whether the portal shows "Raise a ticket" to a visitor. Signed-in
customers can always raise a ticket regardless.

Outgoing mail should work before turning it on — as with Jira Service Management, a
requester who cannot be emailed back has no way to hear the answer.

## Testing it

```bash
bench --site helpdesk.test run-tests --module helpdesk.api.test_ticket          # 10
bench --site helpdesk.test run-tests --module helpdesk.api.test_config          #  4
bench --site helpdesk.test run-tests --module helpdesk.api.test_knowledge_base  # 18
bench --site helpdesk.test run-tests --module studio.studio.doctype.studio_page.test_studio_page            #  9
bench --site helpdesk.test run-tests --module studio.studio.doctype.studio_component.test_studio_component  #  4
bench --site helpdesk.test run-tests --module studio.studio.doctype.studio_app.test_studio_app              # 15
```

**`test_ticket`** — the trust boundary: the setting off refuses the request; a ticket is
raised against the entered email with a Contact linked; a known Contact is reused; an
invalid email and an empty description are rejected; the caller cannot choose the
status; the first message is attributed to the requester rather than to "Guest" (and a
signed-in requester still sends as themselves); enabling the setting does not expose
other tickets; and the endpoint is reachable without a session at all.

**`test_config`** — the endpoint stays guest-reachable, names the session user, and
carries the ticket setting.

**`test_knowledge_base`** — the four public reads: all four still guest-reachable; only
published articles are listed and a guest cannot widen past them; a draft is invisible
to a visitor but previewable by an agent; category narrowing and limits work; and both
payloads keep their fixed shape, so the portal's bindings cannot drift and a caller
cannot ask for other fields.

**`test_studio_page`** / **`test_studio_component`** — the renderer's two lookups: guest
reachability, that the page document arrives whole rather than as a name, that a route
missing its leading slash still matches, and that a visitor sees neither an unpublished
page nor the draft blocks of a published one — while the editor sees both.

**`test_studio_app`** — the renderer template declares the reader's language and
direction, and no longer hardcodes English.

Every assertion about guest reachability checks membership in `frappe.guest_methods`,
because that is precisely what silently broke: an endpoint that stops being
guest-callable takes the whole signed-out portal with it, and nothing else would fail.

Two of these suites could not run at all before. `test_studio_app` and
`test_studio_page` used the legacy `FrappeTestCase`, whose test-record preloader shells
out to `wkhtmltopdf`; on an arm Mac that binary is x86 and the whole module dies before
a single test executes. Moving them to `IntegrationTestCase` — the base class this
repo's own conventions call for — makes 24 tests runnable, 11 of which already existed.
`test_get_published_custom_apps` also exported a standard app to disk on every run,
outside the transaction; it now cleans up after itself.

No frontend tests: neither app has a JS test runner configured, and standing one up for
a handful of computed properties in `session.ts` would be a new framework rather than a
test. Those paths were verified in the browser instead — signed out and signed in, with
the setting on and off.

By hand, signed out:

```bash
curl -s http://helpdesk.test:8000/api/method/helpdesk.api.config.get_config
curl -s -X POST http://helpdesk.test:8000/api/method/helpdesk.api.ticket.new_guest_ticket \
  -H 'Content-Type: application/json' \
  -d '{"subject":"...","description":"<p>...</p>","email":"you@example.com"}'
```

With the setting off the second call returns `PermissionError`; with it on it returns
the new ticket's name.

## Known gaps

- **No email verification.** A visitor can submit under someone else's address. The
  rate limiter caps it at 5 per hour per IP; Zendesk's verification step is the upgrade
  path if that stops being enough.
- **No tracking without an account.** The confirmation offers sign-up. HD Ticket
  already carries a `key` field (used for feedback links) if a guest-viewable ticket
  page is ever wanted.
- **Bylines on the category and home lists** still fall back to the user id for
  guests — the endpoint that resolves display names needs a session. The article page
  is unaffected.
