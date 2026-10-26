# Request layer and write-endpoint inventory (demo_mode)

Research for aerodeval/helpdesk#52 (map #51). Question: where can a `demo_mode`
interceptor fake allow-listed writes and merge a per-browser overlay into later
reads, and what does each of the 9 simulated actions send, get back, and need
reflected?

Sources read (primary, code only):

- helpdesk `upstream/develop` @ `4f41f4c21` (`desk/`, `studio/helpdesk/`, `helpdesk/`).
- frappe-ui **1.0.0-rc.1**, the version the desk build actually ships
  (`desk/package.json:30`; source at `desk/node_modules/frappe-ui/src`). The
  `frappe-ui/` submodule (a3d141c, beta.24) is only aliased in dev mode
  (`desk/vite-helpers.ts`), so its line numbers differ. Paths below marked
  `fui:` are relative to `desk/node_modules/frappe-ui/src`.
- `@framework/ui` = `apps/frappe/ui/src` (`desk/package.json:14`, `link:../../frappe/ui`), marked `fw:`.
- Studio runtime = `frappe/frappe` `develop` `studio/frontend/src` (fetched
  2026-10-26), marked `studio:`. It uses frappe-ui `1.0.1`.
- frappe server: `apps/frappe/frappe/desk/form/activity.py`, `assign_to.py`, `bulk_update.py`.

## Answer

**Use a `window.fetch` wrapper, installed as the first import of each bundle.**
No frappe-ui hook covers all the traffic. `fetch` is the one call that every
JSON path goes through.

| Path | Goes through | Reference |
|---|---|---|
| `createResource`, `createListResource`, `createDocumentResource` | `options.resourceFetcher \|\| getConfig('resourceFetcher') \|\| request` | fui:`resources/resources.js:57-58,106` |
| `call()` | `frappeRequest`, **not** `resourceFetcher` | fui:`utils/call.ts:29` |
| `frappeRequest` | `request()` | fui:`utils/frappeRequest.ts:88` |
| `request()` | global `fetch(url, …)` | fui:`utils/request.ts:54` |
| `useList`, `useDoc`, `useCall` (v2) | vueuse `createFetch`, wraps global `fetch` | fui:`data-fetching/useFrappeFetch.ts:87-95` |
| File upload | `XMLHttpRequest` | fui:`utils/useFileUpload.ts:198,293`, `utils/fileUploadHandler.ts:75,151` |

Why the frappe-ui hooks are not enough:

- `setConfig('resourceFetcher')` is already in use (`desk/src/main.js:39`). It
  does not see `call()`, which is used by bulk assign, bulk edit, KB access and
  portal create/reply. It also does not see v2 composables. Any resource that
  passes its own `resourceFetcher: frappeRequest` skips it too: `fw:composables/useDoctypeMeta.ts:86`,
  `useUserRoles.ts:38`, and `TableMultiSelect.vue:112`.
- `requestHeaders` and `requestBaseUrl` can only change a request. They cannot
  answer it.
- The portal is a separate bundle: the Studio renderer with its own copy of
  frappe-ui 1.0.1 (`studio:renderer.ts`, `studio:setupFrappeUIResource.ts`). A
  `setConfig` call in the desk never reaches it. `window.fetch` is the same seam
  in both bundles.

### Install points

- **Desk:** add a side-effect import as the **first line** of
  `desk/src/main.js` (for example `import "@helpdesk/shared/demo/interceptor"`).
  ES imports are hoisted, so any module-level `auto: true` resource in the import
  graph fires before the body of `main.js` runs. The dev-only
  `get_context_for_dev` request (`main.js:84`) passes through.
- **Portal:** run it at module top level in `studio/helpdesk/router.ts`. The
  Studio renderer imports `router_file` before it mounts anything
  (`studio:router/app_router.ts`, `loadRouterConfig` then `createAppRouter`).
  Custom components and page scripts load lazily
  (`studio:utils/customVueComponents.ts` uses `defineAsyncComponent`;
  `studio:data/studioPageScripts.ts`). Only Studio's own boot reads go out
  first, and they are safe to pass through.
- **Shared code:** put the interceptor and overlay in `shared/src/demo/`
  (`@helpdesk/shared`), which both bundles already import.
- **Uploads:** wrap `XMLHttpRequest.prototype.open/send` for
  `/api/method/upload_file`, or hide the upload controls. Uploads are a blocked
  action anyway.

### Interceptor contract

1. **Parse.** `input` is a string. A `Request` object is possible in principle,
   so handle both. Normalise with `new URL(input, location.origin)`.
   - Only intercept same-origin `/api/method/*` and `/api/resource/*`.
     Telemetry goes to `pulse.m.frappe.cloud` (`fw:telemetry/pulse.ts:66`) and
     passes through.
   - POST bodies are `JSON.stringify(params)` (fui:`request.ts:50`). GET params
     are in the query string (`request.ts:43-48`). Dotted method names get the
     `/api/method/` prefix (fui:`frappeRequest.ts`, `transformRequest`).
2. **Classify by URL, never by HTTP method.** `frappeRequest` defaults to
   **POST** for everything (`method: options.method || 'POST'`), including
   reads like `get_list_data`, `get_ticket_assignees`, and
   `get_rendered_saved_reply`. `run_doc_method` is always a write, and its
   `method` field in the body says which one. Use three lists:
   - **fake:** the allow-listed writes in the table below.
   - **block:** known writes and generic patterns such as
     `frappe.client.(insert|set_value|save|delete|bulk_update|rename_doc)`,
     `run_doc_method`, `upload_file`, `*.delete_*`, `*.create_*`, `*.update_*`
     and `*.set_*`. Show a toast and the Frappe Cloud CTA, then return a 403
     shaped like a Frappe error.
   - **pass:** everything else. For reads that the overlay touches, pass
     through and then patch the JSON.
3. **Answer with a real `Response`:** `new Response(JSON.stringify(body), {status: 200, headers: {"content-type": "application/json"}})`.
   - `frappeRequest` returns the **whole body** when it has `docs`, and
     otherwise only `body.message` (fui:`frappeRequest.ts:150,177`).
   - So mirror the real envelope: `{message}` for plain methods, and
     `{message, docs: [doc]}` for `run_doc_method`.
4. **Plan for fake names.** Any read keyed by a fake name (a ticket the
   customer raised, a KB draft) must be synthesized in full. A passthrough
   would 404, and the resource error handler toasts the failure.
   - HD Ticket autoname is `.####` (`hd_ticket.json:5`). Use a high
     numeric range, such as 900000 and up.
   - HD Article autoname is `hash` (`hd_article.json:4`). Use a random
     10-character hash.
5. **Simulate local realtime only where the UI waits for it.**
   - Call the listeners directly: `socket.listeners(evt).forEach(fn => fn(payload))`.
   - The desk socket is `app.config.globalProperties.$socket`
     (`main.js:92-98`). The portal socket is `app.provide("socket")`
     (`studio:renderer.ts`) and reaches pages as `context.socket`.
   - Never `emit` these events. That would send them to the server.

### Gotchas

- **Writes on page load.** These fire with no user action, so the fake list or
  the server guard must handle them:
  - `run_doc_method` `mark_seen` runs on every ticket open
    (`desk/src/composables/useTicket.ts:48-53`,
    `desk/src/pages/ticket/TicketAgent.vue:180`). Fake it as `{message: 0, docs: [doc]}`.
  - Portal article views: `helpdesk.api.knowledge_base.increment_views`
    (`studio/helpdesk/studio_page/article/article.ts:112`). The error is
    already swallowed.
  - Onboarding: `frappe.onboarding.update_user_onboarding_status` and
    `helpdesk.api.onboarding.mark_persona_captured`.
  - Without fakes, the read-only server guard throws, and
    `fallbackErrorHandler` toasts (`main.js:62`).
- **IndexedDB caches.** Every `cache:` resource writes its data with the
  overlay merged in to `idb-keyval` (fui:`resources/local.ts`,
  `resources.js:112`; `documentResource.js` saves on `get`). Examples:
  - the timeline (`fw:ActivityTimeline/useActivityTimeline.ts:105`)
  - ticket docs
  - `SavedReplyListForModal`

  **Restart demo** must clear the `keyval-store` IndexedDB as well as the
  localStorage overlay. Otherwise the next mount shows the old overlay for a
  moment.
- **`set_value` replaces the whole doc.** `documentResource.setValue` sets
  `out.doc = transform(response)` (fui:`resources/documentResource.js:53-54`).
  A fake that returns only the changed fields wipes the doc. Return the full
  doc: the base doc plus the overlay plus a new `modified`. Get the base with a
  passthrough `frappe.client.get` through the original `fetch`.
- **Pending timeline rows need the exact key.**
  - Reply and comment draw a muted pending row with `addPendingActivity`
    (`EmailEditor.vue:550`, `CommentTextEditor.vue:197`).
  - The row resolves to `email:<name>` or `comment:<name>` from the fake
    response's `message` (`EmailEditor.vue:484-490`,
    `CommentTextEditor.vue:223-227`).
  - It retires only when the next `get_activity_timeline` response has a row
    with **that exact key** (`fw:ActivityTimeline/pendingRows.ts:88-117`).
  - If the key is missing, the row stays muted for good.
- **Bulk edit of 20 or more tickets waits for a socket event.**
  `BulkEditModal.vue:132-150` treats 20 or more as a background job. It then
  waits for `progress` `{percent: 100, task_id}` on the socket
  (`:166-172,185`). Fire it locally. Under 20, return `{message: []}` (no
  failed docnames).
- **Server list endpoints filter, sort and count on the server.**
  - Merging overlay rows into `get_list_data`, `get_grouped_list` or
    `frappe.client.get_list` means repeating the filter in the browser.
  - Keep it simple: patch rows that are already present, by name. Prepend new
    tickets only when the view filter does not exclude them (status `Open`,
    no `_assign` filter, or `@me`). Adjust `total_count` and `row_count`.
- **Same origin, so one overlay.** The desk (`/helpdesk`) and the portal
  (`/help`) share an origin and therefore one localStorage overlay.
  - Action 8 (customer raises a ticket, agent sees it) works across a persona
    switch with no realtime. The switch reloads the page, so the reads on
    mount pick up the overlay.
  - When both are open in separate tabs, use the `storage` event to fire
    `helpdesk:new-ticket` or `helpdesk:ticket-update` locally.
- **Permissions on the real server.** `add_multiple` and
  `submit_cancel_or_update_docs` throw unless `User.bulk_actions` is set
  (`frappe/desk/form/assign_to.py:148`,
  `frappe/desk/doctype/bulk_update/bulk_update.py:61`). This does not matter
  when faked, but the demo Agent user still needs `bulk_actions = 1`, or the
  UI hides the bulk menu.

## Per-action inventory

Notes on the table:

- **Desk** is `desk/src/…`. **Portal** is `studio/helpdesk/…`.
- "Reads" are the responses that must show the overlay.
- "RT" is realtime. "None needed" means the UI reloads by itself after the
  write succeeds.

### 1. Reply (agent)

- **Call:** `POST /api/method/run_doc_method` through a `createResource`
  (`components/EmailEditor.vue:481-512,598`).
- **Payload** (`EmailEditor.vue:580-592`):
  ```
  {dt: "HD Ticket", dn, method: "reply_via_agent",
   args: {attachments: [names], from_email, to, cc, bcc, message}}
  ```
- **Real response:** `{message: <Communication name>, docs: [ticket]}`. The
  name comes from `hd_ticket.py:693` `reply_via_agent`.
- **Fake:** `{message: "<fake comm name>", docs: [ticket]}`. Any server-side
  status change on an agent reply was not traced. Check `reply_via_agent` and
  `on_communication_update` (`hd_ticket.py:1122`) before you mirror one.
- **Reads that must reflect it:**
  - `frappe.desk.form.activity.get_activity_timeline` (GET; params `doctype`,
    `name`, `visible_types`). Add this row to `activities`:
    ```
    {type: "email", key: "email:<name>", timestamp,
     author: {email, fullname, image},
     data: {name, subject, sender, to, cc, bcc, content,
            deliveryStatus: "Sent", attachments: []}}
    ```
    Shape from `frappe/desk/form/activity.py:190-215`.
  - Portal `hd_ticket.api.get_one` → `communications[]`
    (`helpdesk/.../hd_ticket/api.py:154-200`).
  - Ticket list row (`status`, `modified`).
- **What triggers the re-read:** `emit("submit")` → `CommunicationArea` →
  `reloadTicketFeed` (`TicketActivityPanel.vue:46`).
- **RT:** none needed. On the real server: `docinfo_update`, `doc_update`, and
  `helpdesk:ticket-update` (`hd_ticket.py:70-76`).

### 2. Comment with @mention (agent)

- **Call:** `POST run_doc_method` (`components/CommentTextEditor.vue:216-240`).
- **Payload:**
  ```
  {dt: "HD Ticket", dn, method: "new_comment",
   args: {content: <html with mention spans>, attachments}}
  ```
- **Real response:** `{message: <Comment name>, docs: [ticket]}`
  (`hd_ticket.py:641-653`).
- **Fake:** `{message: "<fake comment name>", docs: [ticket]}`.
- **Reads that must reflect it:**
  - `get_activity_timeline`, with this row:
    ```
    {type: "comment", key: "comment:<name>", timestamp, author,
     data: {name, content, attachments: []}}
    ```
    Shape from `activity.py:258-271`.
  - `helpdesk.api.timeline.get_comment_extras` (reactions and pins;
    `useTicket.ts:93-97`). It can return empty extras for fake names.
- **What triggers the re-read:** `emit("submit")` → `reloadTicketFeed`.
- **RT:** none needed. The mention notification goes to the *other* user's
  Notification Log, so the current viewer's bell does not change.

### 3. Assign (agent)

- **Add:** `POST frappe.desk.form.assign_to.add` (`ticket-agent/AssignTo.vue:549-561`).
  - Payload: `{doctype: "HD Ticket", name, assign_to: [agent emails]}`.
  - Real response: `{message: [{owner, name}]}`, the open ToDos
    (`frappe/desk/form/assign_to.py:25-39,143`).
  - Fake: build the same list from the overlay.
- **Remove:** `POST helpdesk.api.doc.remove_assignments`.
  - Payload: `{doctype, name, assignees: [...]}`.
  - Real response: `{message: null}` (`helpdesk/api/doc.py:736`).
- **Command palette** also calls `assign_to.add`
  (`command-palette/ticketCommands.ts:355-369`).
- **Reads that must reflect it:**
  - `hd_ticket.api.get_ticket_assignees`, reloaded at `AssignTo.vue:621`.
    Shape: `[{name, agent_name, user_image, availability, availability_changed_on}]`
    (`hd_ticket/api.py:665-691`).
  - `frappe.client.get` HD Ticket `_assign` (a JSON string).
  - `get_list_data` rows `_assign`.
  - `get_activity_timeline`, a `log` row:
    ```
    {type: "log", key: "log:<name>",
     data: {name, subtype: "Assigned", text, assignee}}
    ```
    Shape from `activity.py:415-426`.
- **RT:** the timeline log row only shows up live through `docinfo_update`
  (`fw:ActivityTimeline/liveUpdates.ts:104-107`). `AssignTo` does not reload
  the feed. Fire `docinfo_update` locally with
  `{doc: {reference_doctype, reference_name, ...}, key, action: "add"}`, or let
  the row appear on the next feed load.

### 4. Status or priority (agent)

- **Call:** `POST frappe.client.set_value` through `ticket.setValue`.
  - Status: `ticket-agent/TicketHeader.vue:150-157`, then `reloadTicketFeed`.
  - Other fields: `TicketDetailsTab.vue:345-364`.
  - Palette: `ticketCommands.ts:340-352`.
- **Payload:** `{doctype: "HD Ticket", name, fieldname: {status | priority: value}}`
  (fui:`documentResource.js:35-42`).
- **Real response:** `{message: <full doc>}`.
- **Fake:** the full merged doc, with `modified` set to now. This is required;
  see Gotchas.
- **Reads that must reflect it:**
  - `frappe.client.get` HD Ticket.
  - `get_list_data` rows.
  - `get_grouped_list`, when grouped by status or priority.
  - `get_activity_timeline`, a `version` row:
    ```
    {type: "version", key: "version:<v>-0",
     data: {fieldname, type: "diff", prefix: "changed Status",
            from, to}}
    ```
    Shape from `activity.py:548-588`. The desk filters version rows to
    `VERSION_FIELDS` (`TicketTimeline.vue:100-122`).
  - Portal `get_one`, and `get_timeline_changes` (GET; `[{field, from, to, by, on}]`;
    `hd_ticket/api.py:48-70`).
- **RT:** `notify_ticket_update` is *emitted* to the server
  (`composables/realtime.ts:44-50`). It is harmless; drop it or let it go out.
  The list relies on `updateRowInListResource` in `beforeSubmit`
  (fui:`documentResource.js:46-51`), which only patches the v1 list
  resources. `get_list_data` is a plain resource, so it shows the change only
  on the next reload.

### 5. Insert saved reply (agent)

- **Pick (a read; pass through):**
  - `POST helpdesk.api.saved_replies.get_rendered_saved_reply` with
    `{saved_reply_id, ticket_id}` → `{title, message, actions}`
    (`SavedRepliesSelectorModal.vue:306-326`, `helpdesk/api/saved_replies.py:17-38`).
  - The list comes from `createListResource` HD Saved Reply
    (`SavedRepliesSelectorModal.vue:250-261`).
  - `frappe.client.get_list` provides the scope counts (`:265-281`).
- **Send:** action 1, then `POST helpdesk.api.saved_replies.apply_saved_reply_actions`
  (`SavedReplyActions/SavedReplyActions.vue:202-256`).
  - Payload: `{ticket_id, actions: [{action_type, value}]}`.
  - Real response: `{message: {applied: [...], skipped: [...]}}`
    (`saved_replies.py:54-118`).
  - Fake: `{applied: actions, skipped: []}`.
  - Apply each action to the overlay: field set, assign (as in action 3), tags,
    and "Add Comment" (as in action 2).
- **Reads:** the same as actions 1 to 4.
  `reloadTicket` and `reloadTicketFeed` run on success (`SavedReplyActions.vue:197-200,222`).
- **RT:** none needed.

### 6. Bulk assign or status (agent)

- **Bulk assign:** `call("frappe.desk.form.assign_to.add_multiple")`
  (`ticket-agent/BulkAssignModal.vue:41-58`).
  - Payload: `{doctype: "HD Ticket", name: JSON.stringify([ids]), assign_to: JSON.stringify([emails])}`.
  - Real response: `{message: null}`.
- **Bulk edit:** `call("frappe.desk.doctype.bulk_update.bulk_update.submit_cancel_or_update_docs")`
  (`BulkEditModal.vue:43-47,119-163`).
  - Payload: `{doctype, docnames: [...], action: "update", data: {[field]: value}, task_id}`.
  - Real response: `{message: [failed docnames]}` for fewer than 20, and
    `null` for 20 or more (enqueued).
- **Reads that must reflect it:** `get_list_data`, `get_grouped_list`, and
  every ticket's `frappe.client.get` and assignees. `@success` →
  `reset(true)` → list reload (`pages/ticket/Tickets.vue:54-64,283-286`).
- **RT:** `progress` `{percent: 100, task_id}` for 20 or more (fire it
  locally). The bulk delete path uses `msgprint`, but delete is blocked.

### 7. KB article draft (agent)

- **Call:** `POST frappe.client.insert` (`stores/knowledgeBase.ts:5-21`, called
  from `pages/knowledge-base/NewArticle.vue:124-145`).
- **Payload:** `{doc: {doctype: "HD Article", title, content, category}}`.
- **Real response:** `{message: <full HD Article doc>}` with a hash `name`.
  `status` defaults to Draft.
- **Then:** the page routes to `/kb/articles/<name>`.
- **Reads that must reflect it (all for a fake name, so synthesize them):**
  - `helpdesk.api.knowledge_base.get_article` (GET `?name=`; `Article.vue:375-393`).
  - `helpdesk.api.article.get_article_stats` → `{likes, dislikes, views}` (`:395-404`).
  - Agent KB list: `get_list_data` with `doctype: "HD Article"` and
    `view_type: "group_by"` (`KnowledgeBaseAgent.vue:580-590`), plus
    `get_grouped_list` (`composables/useGroupedList.ts:19-40`).
- **Follow-up edits:** publish and unpublish use `frappe.client.set_value`
  (`Article.vue:437-455`). Allow-list it for HD Article names in the overlay,
  or block it.
- **Portal:** drafts never show there.
- **RT:** none.

### 8. Customer raises a ticket, and it shows in the agent inbox

- **Call:** `call("helpdesk.helpdesk.doctype.hd_ticket.api.new")`
  (portal `components/ticket/NewTicketForm.vue:426-452`).
- **Payload:** `{doc: {subject, description, template, ...fields}, attachments: [File docs], origin}`.
- **Real response:** `{message: <ticket as_dict, hidden fields stripped>}`
  (`hd_ticket/api.py:27-37`).
- **Then:** `emit("created", ticket)` → `openTicket` → `/help/tickets/<name>`
  (`studio_page/new_ticket/new_ticket.ts:28`).
- The server would also `publish_event("helpdesk:new-ticket")` and create the
  first Communication from the description (`hd_ticket.py:202-210`). The
  overlay must create that first email row too.
- **Reads that must reflect it.** The name is fake, so synthesize these.
- Portal reads:
  - `hd_ticket.api.get_one`
    (`studio_page/ticket/ticket.ts:32-35`). Return
    `{...doc, communications: [...], assigned_on, contact, customer_image,
    outside_hours_banner, overdue_by, has_agent_replied,
    template: {fields}, _form_script}`
    (`api.py:80-132`). Take `template` and `_form_script` from any real
    ticket's `get_one`.
  - `get_timeline_changes` → `[]`.
  - `helpdesk.api.article.get_related` (by subject) can pass through.
  - Portal list: `frappe.client.get_list` and `frappe.client.get_count` for
    HD Ticket (`fw:components/ListView/useListData.ts:37-72`, used by
    `studio_page/customer_tickets/customer_tickets.ts:84-106`).
- Agent reads:
  - `get_list_data` and `get_grouped_list`.
  - Opening the ticket needs every per-ticket read in `useTicket.ts:45-97`:
    `frappe.client.get` and `run_doc_method mark_seen`, `get_ticket_assignees`,
    `get_ticket_contact`, `get_recent_similar_tickets`,
    `helpdesk.api.timeline.get_ticket_calls`, `get_comment_extras`, and
    `helpdesk.api.ticket_analytics.get_ticket_analytics`.
  - Also `get_activity_timeline` and `hd_ticket.api.get_navigation_tickets`
    (`composables/useTicketNavigation.ts:9`).
- **RT:**
  - The desk inbox reloads on `helpdesk:new-ticket`
    (`pages/ticket/Tickets.vue:401-409`). A persona switch reloads the page
    anyway; for a second tab, use the `storage` event.

### 9. Customer replies (portal)

- **Call:** `call("run_doc_method")` (`composables/useReplyComposer.ts:44-61`).
- **Payload:**
  ```
  {dt: "HD Ticket", dn, method: "create_communication_via_contact",
   args: {message, attachments}}
  ```
- **Real response:** `{message: null, docs: [ticket]}`. The method returns
  nothing (`hd_ticket.py:834-...`). It sets `status = ticket_reopen_status`
  and inserts a Received Communication.
- **Then:** `ticket.fetch()` → `get_one`.
- **Reads that must reflect it:**
  - Portal `get_one.communications[]`. Each entry is
    `{name, content, creation, communication_date, sender, subject,
    sent_or_received: "Received", attachments: [],
    user: {name, image}, is_agent: false}`
    (`api.py:154-200`).
  - Agent `get_activity_timeline`, an email row with `deliveryStatus` empty.
  - Agent `get_list_data` row `status` and `modified`.
- **RT:** the portal ticket page refreshes on `doc_update`, `docinfo_update`
  and `helpdesk:ticket-update` (`ticket.ts:83-112`). The desk ticket refreshes
  on `helpdesk:ticket-update` (`TicketAgent.vue:218-240`). Neither is needed
  for the replying user. In a second tab, fire them from the `storage` event.

## Realtime events the UI listens to (desk and portal)

| Event | Listener | Use in the demo |
|---|---|---|
| `helpdesk:new-ticket` | `desk/src/pages/ticket/Tickets.vue:401` | cross-tab action 8 |
| `helpdesk:ticket-update` `{ticket_id}` | `TicketAgent.vue:219`, portal `customer_tickets.ts:131`, `ticket.ts:105` | cross-tab actions 1, 4, 9 |
| `docinfo_update` / `doc_update` | `fw:ActivityTimeline/liveUpdates.ts:104-107`, `TicketTimeline.vue:501-502`, portal `ticket.ts:103-104` | live assign log row (action 3) |
| `progress` `{percent, task_id}` | `BulkEditModal.vue:185` | bulk edit, 20 or more |
| `ticket_update`, `ticket_viewers`, typing events | `composables/realtime.ts` | none (presence) |
| `helpdesk:settings-updated` | `stores/config.ts:37`, portal `stores/session.ts:73` | none (settings are blocked) |

With the server read-only, no real event ever fires for a visitor's actions.
Every flow above works without realtime, because the component reloads after
`onSuccess`. The exceptions are the assign log row (action 3) and bulk edit of
20 or more (action 6).

## Not verified

- The Studio runtime was read from `frappe/frappe@develop`. The bench's local
  `apps/frappe` checkout has no `studio/`, and `apps/studio` is an older
  standalone copy. Check the frappe-ui version in the deployed bench group. The
  `window.fetch` seam does not depend on that version.
- Payload shapes are from the client code and the server signatures. They were
  not captured from live network traffic.
