# Uncommitted changes

Everything currently sitting in the working tree, across two repositories. Nothing is
committed.

| Repository | Branch | Files |
|---|---|---|
| `.worktrees/kb-portal` (helpdesk) | `studio-changes` | 7 Python, 23 Studio-app files, 3 new files |
| `apps/studio` | `develop` | 7 source, 3 test files, 1 template |

> **`apps/studio` is on `develop`** — a shared upstream branch, not a feature branch.
> Those changes are framework fixes the KB portal depends on; branch them before you
> push.
>
> `helpdesk/public/app_builds/**` also shows as changed. That is generated output from
> `studio.build.build_standard_apps` and is not hand-edited.

A full write-up of the guest-ticket feature and the competitor research behind it is in
[GUEST_TICKETS.md](./GUEST_TICKETS.md). This file is the inventory.

---

## 1. Anyone can raise a ticket

The feature this round was for. `allow_anyone_to_create_tickets` already existed on HD
Settings with a switch in the agent desk; nothing on the portal called it.

| File | Change |
|---|---|
| `helpdesk/api/ticket.py` | **New** `new_guest_ticket` — `allow_guest`, rate-limited 5/hour/IP. Four named arguments rather than a document dict, so an anonymous caller cannot set status, customer, team or assignment. Creates or reuses the Contact for the address given |
| `helpdesk/api/config.py` | `get_config` now also returns `allow_anyone_to_create_tickets` and `session_user` — one guest-readable call answers both "am I signed in?" and "may I raise a ticket?" |
| `helpdesk/helpdesk/doctype/hd_ticket/hd_ticket.py` | `set_guest_ticket_creation_permission` narrowed to **create only** — see §2 |
| `studio/helpdesk/stores/session.ts` | **New.** `isGuest`, `canCreateTicket`, `loginUrl`, `accountMenuOptions`. Rides along in `useSettingsModal`, so no page script needed editing |
| `studio_page/new_ticket/*` | Guest mode: Name + Email fields for visitors, template-driven fields hidden from them, confirmation with the ticket ID and a sign-up link replacing the form once it lands |

### 1b. …and is invited to claim it

Raising one anonymously was only half a flow: `get_one` has no `allow_guest`, so the
requester could never see what they wrote, and `send_acknowledgement_email` is skipped for
`via_customer_portal` tickets, so **no email was sent at all**. Now the server invites them,
and accepting turns the address into an account that owns the ticket — `get_one` matches the
reader against `raised_by`, and `after_accept` links the Contact `new_guest_ticket` already
created.

The framework does the work: `invite_by_email` decides who needs inviting, `User Invitation`
mints and hashes the key and sends the mail, and `accept_invitation` creates the user, sets a
password and redirects to `redirect_to_path` — pointed at `/kb/tickets/<name>`. Issued as a
system user, because `validate_role` admits only agent and customer-manager roles, and that
also satisfies helpdesk's own `validate_customer_scope` hook.

**Not `Web Form Request`**, which was the obvious candidate. It is a bearer token, not an
identity — `has_web_form_permission` returns `False` for Guest outright, and lookup is on
`(web_form, key)` with no email or session — so it grants "whoever holds the link". Its
signed-in path is `owner`-based, and a guest ticket's owner is literally `"Guest"` while
helpdesk decides ownership through `contact`.

Two behaviours worth knowing:

- **The invitation is queued, not sent inline.** `send_invitation_mail` runs from
  `after_insert` with `now=True`, which flushes the mail during the request's own
  `db.commit()` — so on a site whose outgoing server is unreachable the submission 500s
  *after* the ticket is written, and no `except` around the call can catch it, because it
  fires once the whitelisted function has already returned. Confirmed by traceback, then
  moved to `frappe.enqueue`; the failure now lands in the worker log and the visitor still
  gets their ticket number.
- **An address that already has an account is not invited at all.** `invite_by_email` only
  skips addresses that *accepted* an invitation, so an account made any other way would be
  invited again — and accepting adds `HD Customer` to it, which is wrong when the person
  raising from the public form is an agent.

## 2. Security fix: the setting used to expose every guest ticket

Turning the setting on granted the **Guest** role `read`, `write`, `create` *and*
`if_owner` on HD Ticket. Every guest ticket is owned by the literal user `"Guest"`, so
`if_owner` drew no line between visitors: **any anonymous person could read and write
every other guest's ticket.**

Now `create` only, with each permission set explicitly — `add_permission` seeds a new
row with `read` already on, so narrowing the list alone would have left `read: 1` with
no `if_owner` to constrain it, which is strictly worse.

## 3. Two lifecycle bugs in HD Ticket

Both surfaced on the guest path, both fixed where every caller routes through:

- `on_communication_update` called `self.save()` without `ignore_permissions`, unlike
  every sibling save in the same path. The permission was already asserted when the
  communication was written; this is only the bookkeeping that follows.
- `create_communication_via_contact` set the sender to `frappe.session.user`, so a
  guest's opening message read as coming from "Guest". It now falls back to `raised_by`
  when there is no session identity.

## 4. The published portal never worked signed out

Not a regression — it had never rendered for a guest, which is why the "Login" button
in the topbar was unreachable by the people who needed it. Four calls in the Studio
renderer are closed to guests.

**In `apps/studio`:**

| File | Change |
|---|---|
| `studio_page.py` | `find_page_with_route` is `allow_guest` and returns the page **document** rather than its name — the renderer used to fetch it separately through `frappe.client.get`. Unpublished pages, and the draft blocks of published ones, are withheld from anyone without read permission |
| `studio_component.py` | **New** `get_component` — guest-callable; a page built from shared components cannot draw without them |
| `codeStore.ts` | `setPageResources` / `setPageVariables` use the child tables the page document already carries instead of re-querying them over `frappe.client.get_list`. Only the editor reloads the list resources, because its Data panel binds to them |
| `componentStore.ts`, `helpers.ts`, `studioStore.ts` | Call sites for the above |

Three more resources fetched through `frappe.client.get_list` on page load and threw
uncaught `PermissionError`s at every visitor. Two of them were **broken features**, not
noise: `articleSearch.ts` backs the KB search box, and `KbArticleSuggestions.vue` backs
the suggested-articles card on the ticket form — a signed-out visitor got nothing from
either. Both now read the public endpoints below (with `method: "GET"`, which frappe-ui
does not default to). The third, `ticketCells.ts`, loads ticket statuses and priorities
for the signed-in list but sat at module scope in every page bundle; it is fetched when
a ticket list mounts instead.

**In helpdesk** — the KB's own reads had the same problem, so four endpoints in
`helpdesk/api/knowledge_base.py` replace the `Document`/`Document List` resources:
`get_public_articles`, `get_public_article`, `get_public_categories`,
`get_public_category`. All `allow_guest`, all with **fixed field lists** and a status
filter that is not a parameter, so an anonymous caller can widen neither. The
`public_kb`, `category` and `article` pages were repointed at them (`.doc` bindings
became `.data`).

## 5. Topbar and navigation

- The right-hand cluster moved into the shared `header` component; `public_kb`,
  `category` and `article` each stopped hard-coding their own copy.
- **Raise a ticket** — `{{ canCreateTicket && route.path !== '/new-ticket' }}`. Nothing
  linked to `/new-ticket` at all before.
- **Login** — `{{ isGuest }}`. It used to render for signed-in users too, and redirect
  to `/helpdesk/home`, the *agent* desk, rather than back to the page being read.
- The account menu binds to `{{ accountMenuOptions }}`: a guest gets *Knowledge base*
  and *Log in*; a signed-in user keeps all five items. Its "Knowledge base" item now
  does a router push instead of a full page reload.
- `topbar_logo.json` also lost a duplicate "Knowledge base" title that printed twice
  beside the breadcrumb root.
- **The bar is one height everywhere: 52px with a 1px bottom border.** It had drifted to
  three — 44px on `public_kb` and `new_ticket`, 48px on `article` and `category`, 52px on
  `help` and `customer_tickets` — so the header changed size as you moved between pages.
  `public_kb` also had no bottom border at all: it set `borderColor` and `borderStyle`
  but never a `borderWidth`, so the rule never drew. All six now use the `borderBottom`
  shorthand, which cannot half-apply that way. The gutter is `20px` everywhere too —
  it was 16px on four pages — chosen because that is what the toolbar and the ticket
  list beneath it already use (the agent portal's `mx-5`), so the logo now lines up
  with the column below rather than sitting 4px inside it.

## 6. Customer tickets list

- **Organization switcher** (`KbOrgSwitcher.vue`, **new**) — first control in the
  toolbar, lists the organizations you belong to and acts as a quick filter. The
  customer quick-filter on the right was removed, since the switcher *is* that filter.
  It is a frappe-ui `MultiSelect`: search, a checkbox per organization and a Select All
  footer, so the list can be narrowed to several at once. The condition it writes is
  `customer in [...]`; `equals` is still recognised when reading, so a condition set from
  the Filter panel is the one the switcher reflects rather than a second source of truth.
- **List parity with the agent portal** — columns come from `default_list_data`, and
  `ticketCells.ts` ports the agent list's cell renderers one-for-one: status
  indicator, priority level bars, SLA badges, assignee avatars, star ratings, and the
  unread-bold subject.

Three rendering traps were worked around here, all the same shape — **this app sits
outside the bench's Tailwind and icon content globs, so any utility no other bundled
file uses never compiles.** `fill-ink-*` left the priority icon and star rating
invisible; `!text-*-500` (the desk's status colours) never compiled at all, so every
status drew in the inherited ink. Both now use espresso tokens applied inline. The same
trap cost the guest menu its `lucide-log-in` icon, which is why it uses `lucide-user`.

## 7. Settings dialog

- **Members are a list, not a tree.** The tree nested everyone under the owner, then
  under a manager — a reporting line helpdesk does not record, since any manager can act
  on any member. It is now a table (`KbMemberList.vue`): member, joined, role, row menu,
  with a role filter and a search box. No container border and no fills — rows are
  separated by a hairline and nothing else. Role is icon plus label, and promotion and
  demotion live in the row's `…` menu alongside removal, so the whole column stays
  readable rather than turning every row into a control. `get_members` gained `joined`
  (the membership row's `creation`, not the Contact's) to fill the column.
- **Changing a role is confirmed first.** A manager reads every ticket the organization
  has raised, so the grant is spelled out before it happens — the same wording the agent
  desk uses in `ContactCard.updateManagerRole`. The confirm dialog's button theme is now
  the caller's to set (`confirmAction.theme`), defaulting to red, since granting access
  is not a destructive action.
- **The invite box now suggests people.** frappe-ui's `MultiEmailInput` leaves the
  matching to its host — it only drops what is already selected — and the wrapper passed
  no `options` at all, so the dropdown was permanently empty. New
  `get_invitable_contacts` supplies it, building the set the agent desk's
  `InviteContactDialog.vue` builds: contacts that already have a user, minus the agents,
  minus this organization's members and pending invites.

  It was first scoped to contacts on the organization's **own email domain**, on the
  argument that an unscoped list hands one customer every other customer's staff. That
  suggested nobody: **0 of the 13 customers with a `domain` set match a single contact's
  address**, so the dropdown was empty for every organization on the site. The desk draws
  no such line, and the box already accepts a typed address, so the scope follows the
  desk. The privacy consequence is real and deliberate: a manager of one organization can
  see the name and email of every contact in the helpdesk.
- **The "Organization admin" heading is gone** and its one field now reads
  **Primary Email**, which is what it actually sets — the primary contact's primary
  address, from which `HD Customer.email_id` is derived.
- **Delete organization removed**, both the danger zone in the dialog and the
  `delete_organization` endpoint it was the only caller of.
- **Admin email now saves.** `HD Customer.email_id` is read-only and fetched from
  `primary_contact.email_id`, so the dialog's write was silently discarded while
  reporting success. `set_admin_email` writes through to the primary contact, which the
  field then re-derives.
- **Language and timezone now apply.** `loadPreferences` keyed by email, which loaded a
  *different* User document than the session user — for Administrator the docname is not
  the email. Now keyed by docname.
- **Invite and cancel no longer report a false failure.** Both email inside the same
  request, and `frappe.sendmail(now=True)` fails the whole request after the record is
  already saved. `run()` takes an optional `landed` check and reports "Invitation
  cancelled, but the notice could not be emailed" instead of "Internal Server Error".
- The dialog lives in the URL hash, so it survives a refresh and the device back button
  steps through its screens one at a time.

- **Panels are padded like the desk's**, `py-8 px-10` on the header and `px-10 pb-8` on
  the content, against frappe-ui's `px-[4.4rem]` with `pt-10`/`pb-16` — 40px and 32px
  where it shipped 70.4px and 64px. This could not be done from the outside:
  `SettingsHeader`, `SettingsBody` and `SettingsPanel` each open their template with an
  HTML comment, which makes them multi-root, and **Vue skips attribute fallthrough on a
  fragment** — so the style, class and `data-component-id` Studio binds never reach their
  root element (`SettingsRow`, whose template has no comment, takes all three). They are
  plain padded regions, so the header and body are now containers with the same styles
  the desk writes by hand, and the body scrolls with `overflow-y: auto` as the desk's
  does. Worth an upstream fix: moving the comment inside the root element restores
  fallthrough. The two headers that drew a **title and description from props** now carry
  them as blocks, since a container has nothing to draw them with — same 16px/600
  `ink-gray-8` heading over 14px `ink-gray-6` that SettingsHeader rendered. (The desk sets
  its descriptions in `text-p-sm`; this keeps frappe-ui's `text-base` so nothing but the
  padding moved.)

- **Country joins the identity line**, after email and domain, on a map-pin as the desk's
  customer header carries it. `get_organization` did not return `HD Customer.country`;
  it does now. Its separator is conditional like the first one, so the line closes up
  when a field is missing rather than leaving a stray dot.

- **The primary email row is gone**, and with it `set_admin_email`, the `email` argument
  on `update_organization`, and the editor's store state. It sat under an identity block
  that *already prints the address*, and what it actually wrote was not an organization
  setting at all: `HD Customer.email_id` is read-only and derived, so saving reached into
  the **primary contact** and rewrote that person's primary email address. The desk does
  not offer it either — `customerFields` in `composables/customer.ts` is Name, Customer
  Type, Country and Domain, no email. Net −70 lines.

- **The avatar tells you it is clickable.** Hovering it in the agent portal names the
  action; here the click target had no tooltip, so nothing distinguished the picture from
  a decoration. Now "Change Photo" / "Upload Photo" on a zero-delay tooltip below it, the
  same wording and placement as `Settings/Profile/Profile.vue`.

- **"View organization" when you manage none.** A plain member of every organization they
  belong to can open one and read it but change nothing in it, so the nav item, the panel
  title and its description all say *view* rather than *manage* — off
  `organizations.some((org) => org.role !== 'Member')`, the role `get_organizations`
  already returns.

- **The members list shows Last seen, not Joined.** A membership row's `creation` said
  when someone was added, which nobody needs; the useful column is whether they are still
  around. `get_members` reads it the way `contact.get_contact_info` does — `Contact.user`
  → `User.last_active`, batched into one query for the whole list — and worded with
  `fromNow()` as the agent portal's contact page words it. Anyone with no linked user
  (everyone still holding an invitation) reads "—".

- **Members: search first, full width, then the role filter.** They were the other way
  round with the search boxed at 220px on the right. Its width is set inline rather than
  through the scoped class it used to carry — frappe-ui's `TextInput` root takes no scope
  id, so a scoped rule aimed at it never matched.

- **The back control is the desk's, not a Button.** Both back affordances — out of an
  organization, and out of the invite screen — were ghost `Button`s, so they carried
  button chrome and drew their label at a button's 14px/500. The agent desk
  (`Settings/EmailNotifications/Notification.vue`) draws a bare chevron beside the
  screen's own title instead. Measured off it and reproduced: an 18px chevron at stroke
  width 1.5, an 8px gap, an 18px/20.7px/600 title, the pair 32px tall in `ink-gray-7`,
  and the chevron hanging 6px outside the panel's content edge so the title still lands
  20px in. frappe-ui's `FeatherIcon` supplies the glyph — lucide forked feather and
  `chevron-left` is unchanged between them, so it matches without a lucide utility class
  this app's build cannot compile. The desk fades the whole control to 70% on hover;
  only `hover:opacity-80` is in this bundle, so it fades to 80%.

## 7b. Ticket view

The portal had a ticket *list* but no ticket page — clicking a row left the Studio app
for `/helpdesk/my-tickets/<name>` and the desk SPA's chrome. There is now a
`/tickets/:name` page (`studio_page/ticket`) inside the portal, and the list routes to
it.

The page is drawn from Studio's own components (see 7c) and ported from
`desk/src/pages/ticket/TicketCustomer.vue` and its
`TicketConversation`, `TicketCommunication`, `TicketTextEditor` and
`TicketCustomerSidebar` parts — same layout and the same fields: an Activity thread whose
avatars sit on a connecting rail, a composer that is a quiet strip until clicked and then
opens with attachments and Send, a 382px details sidebar (contact, Ticket ID, Status, the
two SLA badges worded as that sidebar words them, the feedback block, then subject, team,
priority and the template's own customer-visible fields), and **Close** in the topbar.
It makes the same single `hd_ticket.api.get_one` call (which answers with the
communications, so the thread costs no second request) and the same
`create_communication_via_contact` reply, which is what attributes the message to the
requester rather than an agent.

Two things had to change to get Close into the shared topbar. `askConfirm` was private to
the settings store, so no page could raise the confirmation dialog the store already
owns — it is exported now. And a **function does not survive a Studio prop binding**: the
first attempt passed `{label, icon, onClick}` as one object and the click threw
`onClick is not a function`. The label and icon travel as data; the click calls a named
`onPageAction` in the page's own scope, which is how the topbar's existing buttons reach
`canCreateTicket` and `isGuest`.

Spacing was then matched against the live desk page rather than by eye — every value
below was read off `/helpdesk/my-tickets/<name>` with `getComputedStyle` and reproduced:
the Activity heading (18px/20.7px, 600, `24px 40px 8px`, 32px tall), the `30px / 16px`
rail grid, the 28px avatar at `margin-top: 6px`, the card (`10px 12px 0`, 16px below,
10px radius, **transparent border** — the edge is the two-layer shadow
`0 0 1px rgba(0,0,0,.45), 0 1px 2px rgba(0,0,0,.1)`), the 16px byline gap, the composer
strip (36px, `8px 14px`, 8px radius), and the sidebar (382px, 16px between panels, each
`0 20px 12px`, 126px labels at 13px/14.95px, values at 14px/16.1px).

Two of those took finding. The desk's card is `padding-bottom: 0`, yet its messages
have clear space beneath them — it comes from the attachment row, which renders even
with nothing in it and carries `mb-2`. Taken here as 8px of card padding, since that row
only exists when there is something to show. And the desk trims neither the first
paragraph's top margin nor the last one's bottom, which is what makes a multi-paragraph
mail taller than a trimmed one. Cards now measure 74 / 74 / 148px against the desk's
74 / 74 / 148.

One difference is deliberate: this app's `--ink-gray-8` resolves to `lab(7.78%)` where the
desk's renders `rgb(56, 56, 56)` — the two builds ship different espresso versions. The
tokens are kept, so the page follows the portal's own theme (and its dark mode) rather
than being pinned to the desk's hex.

The **outside working hours banner** is there too, asking the same
`show_outside_hours_banner` endpoint and dismissing the same way — remembered in
localStorage under `dismissBanner_<ticket>_<YYYY-MM-DD>`, so it comes back the next day
if the ticket is still unanswered.

**Closing asks for a rating** when the helpdesk requires one. `is_feedback_mandatory` was
already set on this site and already travelled on `get_config`; what was missing was the
dialog. It ports `TicketFeedback.vue`: stars, then the options
belonging to *that* rating (`HD Ticket Feedback Option` filtered by `rating`), then free
text, saved with the single `set_value` the desk uses — status, feedback and comment in
one write, so a ticket is never closed without the rating it asked for. Close falls back
to the plain confirmation when no agent has replied yet: there is nothing to rate on a
ticket nobody answered. The session store now exports `config` itself, which it had kept
private.

Not ported: the mobile Activity/Details tabs.

Message bodies go through `KbEmailContent.vue`, a port of the desk's
`EmailContent.vue`: the mail is rendered **inside an iframe**. That is not decoration —
the frame is what keeps a mail's own markup and styles from reaching the portal around
it, and it is why the HTML can be shown as sent rather than as an editor re-parsed it.
A first attempt rendered bodies through a read-only `TextEditor` instead; tiptap added a
`ProseMirror-trailingBreak` to every paragraph, which showed up as a phantom blank line
the desk does not have. The desk links its built stylesheet into the frame, which this
app has no equivalent of, so the rules that matter are inlined — measured identical to
the desk afterwards: 14px/21px, `rgb(56, 56, 56)`, 8px paragraph rhythm. Quoted replies
fold behind the same "..." toggle.

## 7bb. The Studio editor could not open this app

Every page of the app rendered as red "Failed to fetch dynamically imported module" boxes
on the Studio canvas, and the ticket page — whose layout is gated on data the page script
provides — came up blank. Two causes, both in how this checkout is wired rather than in
the app:

- **The dev server refused to serve it.** `vite.config.js` builds `server.fs.allow` from
  `apps/` plus the studio folder of any app *symlinked* in from elsewhere. This helpdesk
  reaches the bench through a `.pth` in the virtualenv instead, with `apps/helpdesk` left
  as the main clone, so the checkout was never allowed and every custom `.vue` and every
  page `.ts` 404'd. `vite.config.js` now also reads the `.pth` files — the same source the
  interpreter reads — and allows the studio folder of anything they point at.
- **`@app/*` resolved one directory too high.** `studioRootAlias` finds an app's root with
  `indexOf("/studio/")`, and the checkout was itself named `studio`
  (`.worktrees/studio/studio/helpdesk/…`), so the *worktree* matched first and `@app/`
  pointed at `.worktrees/studio/studio`. The worktree is now `.worktrees/kb-portal`
  (`git worktree move`, `helpdesk.pth` repointed), which resolves correctly. The
  production build was unaffected — it resolves `@app/*` through each app's `tsconfig.json`,
  which the dev server does not apply.

Renaming the checkout also left `sites/assets/helpdesk` dangling, which 500'd the whole
portal until it was repointed.

## 7c. The ticket page, built from Studio components

The page was one 727-line custom component dropped into an otherwise empty Studio page,
which meant the only part of the portal nobody could edit on the canvas was its busiest
screen. It is now a block tree of Studio's own components — `container`, `TextBlock`,
`Repeater`, `Avatar`, `Tooltip`, `Badge`, `Button`, `Alert`, `TextEditor`,
`FileUploader`, `Rating`, `Dialog`, `FormControl` — and the logic moved into three
composables the page script spreads: `stores/ticketThread.ts` (thread, banner,
composer), `stores/ticketDetails.ts` (sidebar fields, SLA), `stores/ticketFeedback.ts`
(rating dialog). `KbTicketView.vue` and `KbTicketFeedback.vue` are gone.

Every value a block binds is finished in TypeScript — `dataItem.timeAgo`,
`dataItem.railHeight`, `slaInfo[].badge`/`.theme` — so no expression in the JSON computes
anything. The `dismiss`, `change`, `success` and `click` handlers are Studio
**Run Script** events, and the two-way fields (`feedbackOpen`, `feedbackStars`,
`feedbackText`) bind to page-script refs through `{"$type": "variable"}`, so they all show
up in the editor's own panels rather than being invisible props.

`KbEmailContent.vue` is the one custom component left, and it earns it: an email body has
to render inside an iframe (7b), which no Studio primitive does.

Three things could not survive as inline styles and are the only places the block tree
diverges from the SFC's CSS. The rail's connecting line was a `::after`; it is now a real
1px `container` whose `height` binds to `{{ dataItem.railHeight }}` (`100%`, or `20px` on
the last message). The composer strip's hover needs a class, not a style, so its
background comes from `bg-surface-gray-2 hover:bg-surface-gray-3` instead of an inline
colour. And the editor's min/max height moved from `editorClass` onto a wrapper, because
this app sits outside the bench's Tailwind content globs and an arbitrary-value utility
would never compile.

Re-measuring against the desk turned up four things the SFC had wrong:

- the byline's separator is a 16px dot **icon** with `gap-0.5`, not a character with a
  6px gap — the dot block is 16px wide and centred, so the byline measures 72/16/73 as
  the desk's does;
- the sidebar's contact name is 20px/23px in a fixed **242px**, not 16px/18.4px hugging
  its text;
- the feedback panel is the one panel that sets `leading-5`, so a wrapped comment is 20px
  a line — that panel now measures 141px against the desk's 141px, where it was 125px;
- the thread's timestamps come from the desk's own `prettyDate`, not dayjs's `fromNow`:
  eight days is "1 week ago" there and was "8 days ago" here.

The thread also lands on the newest message a second after load, or on the message the
URL hash names — each row carries its Communication docname as its `id`, the way
`TicketConversation` does it.

Attachment buttons ask for `lucide-file` rather than the legacy feather name, which is
both the right glyph and free of frappe-ui's deprecation warning. The desk picks the icon
per mime type (`file-image`, `file-video`, …); those utilities are not in this app's
compiled CSS for the content-glob reason above, so every attachment shows the generic
file icon.

Cards measure 74 / 74 / 148px and sidebar panels 43 / 189 / 141 / 283px — the desk's
numbers exactly.

The body is gated on `{{ !ticketId || ticket.data }}` rather than `ticket.data` alone.
The desk renders nothing until the ticket lands and this keeps that, but the Studio canvas
opens `/tickets/:name` with no `:name` — the narrower gate left the page blank there,
which is the one place the whole point is to see the layout.

**Bug fixed along the way.** `KbEmailContent.collapseQuotes` looped forever on any mail
carrying a quote marker: folding keeps the quote's markup, so searching for the same
selector afterwards found the copy inside the fold and folded it again. The tab froze
hard enough to survive navigation. The desk avoids it by stripping `gmail_quote` off the
clone; here the search skips what is already folded
(`selector:not(.replied-content *)`), which covers all three markers. Ticket 2923 —
three quoted mails and two attachments — renders in one pass now.

## 8. Language and direction

`app_renderer.html` hardcoded `lang="en"` and declared no direction, so a published
Studio app never spoke the reader's language and never laid out right-to-left.
`StudioAppRenderer.update_context` now supplies both from `frappe.local.lang` and
`is_rtl()`.

> Block copy inside the Studio pages is still untranslated — a language change moves
> direction and framework strings, not the portal's own text. Running every TextBlock
> through `__()` is a separate piece of work.

## 9. Smaller UI fixes

| Where | What |
|---|---|
| `KbEmptyState.vue` | A comment above the root element made the component multi-root, so Vue silently dropped the caller's `class` — which is how the caller sized it. The empty state hugged the top of the page |
| `public_kb.json` | A `backgroundColor` base style rendered as an inline style and outranked `hover:bg-surface-gray-2`, killing the category-card hover |
| `KbFileAttachment.vue` | Reshaped as a `TextInput` sm/subtle so it matches every other control on the ticket form; the whole row opens the picker |
| `KbSearch.vue`, `articleSearch.ts` | Search matches use weight and ink rather than an amber highlighter pill — the only splash of colour in a greyscale portal |
| `KbCopyLink.vue` | Sized and coloured as part of the article byline rather than as a link out of it |
| `KbHelpSearch.vue` | The no-results state centres in the viewport instead of stranding itself under the search box |
| `KbOrganizationList.vue` | Grid/list toggle and its toolbar removed; one card layout (−160 lines) |
| `new_ticket.json` | The description editor had no height: `min-h-[7rem]`/`max-h-[16rem]` are arbitrary Tailwind values, which never compile for this app. Now `min-h-32`/`max-h-60` (128px/240px), which do |
| `public_kb.json` | Category cards are a fixed **132px** with the description clamped to two lines. A min-height stopped a short card shrinking but did nothing for a long one: a two-line description made its card taller than the rest of its row |
| `public_kb.json` | The hero's banner image **and** its dark scrim are gated on `config.data.banner_image`. The scrim exists to darken a photo; with no photo it was a grey slab across the hero |
| `api/config.py` | `get_config` answers for every requested field. A Single stores only what has been set, so an untouched field came back **missing** rather than empty — which the portal read as undefined |
| `stores/session.ts` | **Log out actually logs you out.** The menu item navigated to `/api/method/logout`, but frappe declares that endpoint `methods=["POST"]`, so a browser GET was refused — you got a 403 "Not Permitted" page and kept your session. It is posted through `call('logout')` now, then returns you to `/kb` as a visitor |
| `article.json` | Sidebar article rows hover again. Their `backgroundColor` base style rendered inline as `transparent`, and an inline style outranks a `hover:` class — the same trap that killed the category-card hover. The inactive case is now left unset so the class can win |

> **The banner image cannot currently be set on this site.** `banner_image` is declared
> in `hd_settings.json` on disk but has no DocField row in the site's HD Settings, so
> writing it fails. `bench --site helpdesk.test migrate` adds the field; after that,
> Settings → Branding. Until then the hero correctly shows no image rather than a grey
> slab.

## 10. Tests

78 passing, 51 new.

| Module | Tests |
|---|---|
| `helpdesk.api.test_ticket` | 10 — **new file** |
| `helpdesk.api.test_guest_invite` | 5 — **new file** |
| `helpdesk.api.test_organization` | 13 — **new file** |
| `helpdesk.api.test_config` | 4 — **new file** |
| `helpdesk.api.test_knowledge_base` | 18 (13 new) |
| `studio…test_studio_page` | 9 — **new** |
| `studio…test_studio_component` | 4 (3 new) |
| `studio…test_studio_app` | 15 (3 new) |

`test_studio_app` and `test_studio_page` used the legacy `FrappeTestCase`, whose
test-record preloader shells out to `wkhtmltopdf`; on an arm Mac that binary is x86 and
the module dies before a single test runs. Moving them to `IntegrationTestCase` — what
this repo's own conventions call for — made **11 pre-existing tests runnable for the
first time on this machine**. `test_get_published_custom_apps` was also exporting an app
to disk outside the transaction on every run; it now cleans up after itself.

`helpdesk.helpdesk.doctype.hd_ticket.test_hd_ticket` still cannot run here for the same
`wkhtmltopdf` reason. It is untouched and pre-existing; the fix is an arm build of that
binary, or setting **Print Settings → PDF generator** to `chrome`.

No frontend tests: neither app has a JS test runner configured, so those paths were
verified in the browser — signed out and signed in, with the setting on and off.

## Rebuilding after a change

From the bench root:

```bash
# block JSON (studio_page/*.json, studio_components/*.json) -> database
bench --site helpdesk.test execute studio.sync_json.sync_file --kwargs '{"path": "<abs .json>"}'

# .vue / .ts changes
bench --site helpdesk.test execute studio.build.build_standard_apps --kwargs '{"app": "helpdesk"}'

bench --site helpdesk.test clear-cache
```

A stale bundle silently swallows a fix, so clear the cache when a change appears not to
have taken. Block JSON must be edited in **both** `blocks` and `draft_blocks`, and
round-tripped through `json.dumps(doc, indent=1, sort_keys=True)` — page files end with
a trailing newline, `kb_settings.json` and `new_ticket.json` do not.
