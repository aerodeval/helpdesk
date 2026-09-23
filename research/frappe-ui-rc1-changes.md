# What changed in frappe-ui `1.0.0-beta.63` → `1.0.0-rc.1`, and where helpdesk feels it

Research ticket: aerodeval/helpdesk#32, "01 — What changed in frappe-ui beta.63 → rc.1?". Map: aerodeval/helpdesk#31.
Written 2026-09-23.

## Method and sources

- **frappe-ui:** `git diff v1.0.0-beta.63 v1.0.0-rc.1` in the `frappe-ui` submodule. That is 341 commits and 755 files, spanning beta.64 to beta.77 and then rc.1. I read:
  - the `docs/content/docs/changelog.md` diff, all 1,380 lines
  - every `src/components/*/types.ts` diff, plus the `.vue` diff for each component helpdesk imports
  - `src/molecules/editor/**`, `src/utils/{call,frappeRequest,useFileUpload,fileUploadHandler,plugin}.ts`, `src/resources/index.ts`, `vite/**`, `tailwind/**` and `package.json`
- **helpdesk:** `upstream/develop` @ `1436448b6`, which pins `frappe-ui: 1.0.0-beta.63`. I read it through `git archive`, so no checkout was needed. Every call site below is a path:line on that commit, relative to `desk/`.
- **CSS delta, measured rather than inferred:** I compiled Tailwind 3.4.19 with the beta.63 preset and with the rc.1 preset over helpdesk's `desk/src`, then diffed the rules. The result is 26 changed rules, 110 removed and 110 added, and **all** of them are accounted for below: line-height, the `hover:` media wrap, the removed `--focus-*` variables, `--radius-9`, and the lucide `:where(:not(svg))` selectors. No spacing or size class that helpdesk uses changed value.
- **Other code that uses frappe-ui:** `@framework/ui` (`apps/frappe/ui`, linked, and deduped onto helpdesk's frappe-ui copy). I checked it on the bench's `HEAD` and on `origin/develop`.

**Mechanical** means `vue-tsc` reports it. **Silent** means it only shows up at runtime or on screen. `desk/tsconfig.json` does not enable `vueCompilerOptions.strictTemplates`, so a **renamed or removed prop is silent**: it falls through as an HTML attribute. It is worth switching that option on temporarily while hunting with vue-tsc.

---

## (a) BREAKING: must fix (12)

### Code changes in helpdesk (11)

| # | Change | Kind | Detect | helpdesk call sites | Fix |
|---|---|---|---|---|---|
| B1 | `Popover` `#trigger` slot drops `toggle(flag)`; use `setOpen(bool)` (and `close()`) | removed slot prop | **mechanical**. At runtime it throws `toggle is not a function` | `src/components/Settings/Holiday/HLCalender.vue:19,31` (holiday calendar hover preview) · `src/components/SearchPopover.vue:3,19` (KB portal search, `KnowledgeBaseCustomer.vue`) · `src/components/view-controls/filter/Filter.vue:3,5` (list filter, `openPopoverFn`) | `toggle(true)` → `setOpen(true)` |
| B2 | `SuggestionExtension` option `component` → `listComponent` | renamed option | **mechanical** (excess property), plus a dev warning. At runtime the popup never renders | `src/tiptap-extensions.ts:80` (the saved-reply `{{ field }}` autocomplete, used by `Settings/SavedReplies/SavedReplyView.vue:108`) | rename the key |
| B3 | Mention items are `{ label, value }`; `id` is gone. The node stores `props.value` as `data-id` | changed item shape | **mechanical** in TS (`MentionItem` lacks `value`), but **silent at runtime with backend impact**: `data-id` is empty, so `helpdesk/utils.py:138 extract_mentions` finds no email and **mention notifications stop** | `src/components/editor/config.ts:35-38` (`MentionItem`), `:52-55` · `src/components/CommentTextEditor.vue:168-172` · `src/components/SavedReplyActions/SavedReplyActionComment.vue:78-82` | map to `{ value: a.value, label: a.label }` and retype `MentionItem` |
| B4 | `TabButtons` option `label` is required, and is a `string` | prop type narrowed | **mechanical** (TS only; the runtime is unchanged) | `src/components/Settings/Holiday/HolidayView.vue:142-152` (icon-only calendar/list toggle) · `src/pages/dashboard/Dashboard.vue:357-362` (the mobile icon-only tabs) | add `label: __("…")`. An `icon` option renders its label `sr-only`, so it causes no visual change |
| B5 | `Tooltip` / `TooltipProvider` / `HoverCard` delays are **milliseconds**, where they were seconds | unit change | **silent**. `0.25` now means 0.25 ms, i.e. an instant open | `src/components/Settings/Sla/SlaPolicyView.vue:110` (HoverCard 0.25) · `src/components/Settings/Assignment Rules/AssignmentRuleView.vue:139,220` (HoverCard 0.25) · `src/components/Settings/Assignment Rules/AssigneeRules.vue:96` (Tooltip 0.35) · `src/components/ticket-agent/analytics/TicketTimeline.vue:29` (Tooltip 0.2). `Profile.vue:36,44` pass `0` and are unaffected | ×1000. The `overlays-v1` codemod converts static values |
| B6 | `Sidebar` `disableCollapse` → `collapsible` (inverted, default `true`) | renamed prop | **silent**. The old prop falls through as an attribute. The mobile drawer then shows a 3rem collapsed rail whenever the desktop sidebar store says collapsed | `src/components/layouts/AppSidebar.vue:4` (`:disable-collapse="mobile"`), reached from `MobileSidebar.vue` | `:collapsible="!mobile"` |
| B7 | `RichTextKit` turns `toc` (and `styleClipboard`) **off** by default | default change | **silent**. "Table of Contents" leaves the `/` menu in every helpdesk editor, and any stored `tocNode` HTML no longer parses, so it is dropped on the next save. `styleClipboard` has no helpdesk UI or shortcut, so it doesn't matter | `src/components/editor/config.ts:52` (every editor goes through `buildEditorExtensions`: email, comment, KB `TextEditor`, `CompactEditor`, saved replies) | add `toc: {}` to `RichTextKit.configure` |
| B8 | `Rating` `size` defaults to `sm` (was `md`) | default change | **silent** (visual) | `src/components/view-controls/filter/FilterValueEditor.vue:93` (the rating filter value). `pages/ticket/TicketFeedback.vue:30` already passes `size="sm"` | `size="md"` |
| B9 | `Checkbox` no longer copies `class`/`style` onto its `<input>` (they went on the wrapper **and** the input before) | attribute routing | **silent** (visual). `me-2` applied twice before and now applies once, so the gap shrinks | `src/components/SearchMultiSelect.vue:92,137` (Search page, `pages/SearchAgent.vue`). `ticket-agent/AssignTo.vue:121` (`flex-shrink-0`) and `Settings/Sla/SlaPolicyView.vue:101` (text classes) are no-ops | to keep parity, double the margin on the wrapper (`me-4`), or confirm by eye |
| B10 | **Typography:** `text-2xs`…`text-4xl` and their `-medium/-semibold/-bold` variants go from line-height **1.15 → 1.35**. The frappe-ui components pin themselves with the new `leading-tighter` class; app code does not | token / CSS change | **silent**, global. Rows grow 2.4–5 px each, and text in fixed-height boxes shifts or clips. The CSS diff confirms 22 changed utilities that helpdesk uses | **416 class uses across 158 files** in `desk/src`. `@framework/ui` text is hit too | **Decision needed.** Either (i) one override in `desk/tailwind.config.js` putting `lineHeight: '1.15'` back on those sizes (parity in one place), or (ii) `leading-tighter` per site. (i) is the lazy, parity-true option |
| B11 | **Tailwind preset sets `future.hoverOnlyWhenSupported`**: every `hover:` compiles under `@media (hover: hover) and (pointer: fine)` | preset / CSS change | **silent**, touch devices only. Anything shown only on hover can no longer be reached by tap | hover-reveal sites: `src/components/ImageAvatar.vue:15,24` · `src/components/Settings/Profile/Profile.vue:49` · `src/components/customer/TicketsTab.vue:78` · `src/pages/home/Home.vue:122`. `frappe-ui/Link.vue:45` and `ticket-agent/AssignTo.vue:60` also have `group-focus-within`, and `view-controls/filter/Filter.vue:197` already has `[@media(hover:none)]` | **Decision needed.** For strict parity, add `future: { hoverOnlyWhenSupported: false }` to `desk/tailwind.config.js`, where the user config wins over the preset. Otherwise add touch paths per site |

### Build and tooling (1, plus a chore)

| # | Change | Kind | Detect | Where | Fix |
|---|---|---|---|---|---|
| B12 | **`@framework/ui` has to move in lockstep with frappe-ui.** rc.1 deletes `CodeEditor`/`CodePreview` from `frappe-ui/experimental` and adds the `frappe-ui/code-editor` subpath. The bench's `apps/frappe` (`fix/composer-label-alignment`, beta.63 era) imports the old names in `ui/src/components/Fields/CodeEditorField.vue`, which helpdesk pulls in through `@framework/ui/fields` (`src/components/ticket-agent/BulkEditModal.vue:39`) | cross-repo coupling | **loud**: `vite build` fails on a missing export | `apps/frappe/ui` | Put `apps/frappe` on `origin/develop` ≥ `3394a6cc3c` "fix(ui): build against frappe-ui 1.0.0-rc.1" (plus `526231281b`, `c992e11ace`), then `yarn install` in `apps/frappe/ui`. It adds `marked` and `@codemirror/{state,view}`, which resolve from `ui/node_modules`, not helpdesk's. **The reverse also holds:** frappe develop past `3394a6cc3c` declares a peer of `frappe-ui >=1.0.0-rc.1` and imports `frappe-ui/code-editor`, which beta.63 does not export. So helpdesk on beta.63 will not build against current frappe develop either |
| chore | `desk/patches/frappe-ui+1.0.0-beta.63.patch` (patch-package, the suggestion-popup `autoUpdate` fix) | packaging | patch-package warns about the version mismatch | `desk/patches/` | **Still needed:** rc.1 does not carry the fix, and `suggestion-renderer.ts` is byte-identical between the two tags, so the patch still applies. Rename it to `frappe-ui+1.0.0-rc.1.patch` |

Count: **4 mechanical** (B1–B4, of which B3 is also a silent backend break) and **7 silent** (B5–B11), for 11 code items, **+ 1 build/tooling** item (B12).

---

## (b) AFFECTED BUT SHOULD BE FINE: for Sydney to check by hand

| Change | Where helpdesk touches it | Screen / flow to walk |
|---|---|---|
| `SidebarItem` passes non-class, non-style, non-listener attributes (`id`, `data-*`, `aria-*`) to the inner link/button, not the row `div`. `class` and `@click` stay on the row | `layouts/AppSidebar.vue:32-38` (`:id="item.id"`). The ids are `notifications-btn` (`AppSidebar.vue:237,245`), which `notifications/Notifications.vue:46` uses as its `onClickOutside` ignore target | Agent sidebar → open **Notifications**, then click the row, including its right-hand suffix area. The panel should toggle, not close and reopen |
| `Sidebar` root is now `<nav aria-label="Main">`. `SidebarSection` bodies are `div role=group` | helpdesk wraps each section's items in its own `<nav>` (`layouts/AppSidebar.vue:28`), so landmarks are now nested (a11y only). Optional: make it a `div` | Agent sidebar looks and collapses the same (desktop and mobile drawer) |
| `SidebarItem.icon` goes through the shared `Icon`. Plain-text icons render nothing | `layouts/Sidebar.vue:24-27` passes the `HelpIcon` component, which is fine | Sidebar **Help** row shows its icon |
| `toggleColorScheme()` flips what is on screen, not the stored preference (under `system` on a dark OS, the first press used to do nothing) | `layouts/Sidebar.vue:122,127` · `layouts/MobileSidebar.vue:54,93` · `command-palette/commands.ts:121,129` | Toggle theme from the user menu, mobile menu and ⌘K with the OS in dark mode and the preference set to "system". The new behaviour is arguably the fix; decide whether parity means keeping the no-op |
| Date pickers rebuilt: `DateCalendar`/`DateRangeCalendar` split out, `PickerShell` rebuilt on `Popover`, `open` honoured at mount, `open()`/`close()` exposed | `DatePicker`: `Settings/Holiday/HolidayView.vue:72,93`, `Settings/Holiday/Modals/AddHolidayModal.vue:12`, `Settings/Sla/SlaPolicyView.vue:168,185`. `DateRangePicker`: `view-controls/filter/FilterValueEditor.vue:95`, `pages/home/components/RecentFeedback.vue:145`, `pages/home/components/AvgTimeMetrics.vue:32`, `pages/dashboard/Dashboard.vue:33` (the last three call `ref.open()` after choosing "Custom") | Settings → Holiday lists (add, edit dates) · SLA policy dates · list **Filter** → date "between" · Home → feedback and avg-time "Custom range" · Dashboard → "Custom" date range opens straight away |
| `Select` emits `null` (was `undefined`) for "nothing selected"; `clear()` writes `null` | `Settings/InviteAgents.vue:22`, plus `FormControl type="select"` at `conditions-filter/CFCondition.vue:55`, `EmailEditor.vue:23`, `telephony/CallUI.vue:19`, `view-controls/QuickFilterField.vue:13`, `ticket/ExportModal.vue:8`, `customer/InviteContactDialog.vue:29`, `customer/NewCustomerDialog.vue:29` | Clear or empty each select once. Quick filters and the export modal are the ones most likely to compare against `undefined` |
| A bare `Switch` (no label) gets `flex` on its container and no longer takes its height from the parent's line-height | 22 bare switches, all in Settings: `General.vue:55`, `General/components/TicketSettings.vue:18,29,43,75,119,209`, `WorkflowKnowledgebaseSettings.vue:16,34`, `Teams/TeamEdit.vue:9`, `Teams/NewTeam.vue:10`, `Sla/SlaPolicyView.vue:10`, `Sla/SlaPolicyListItem.vue:22`, `Assignment Rules/AssignmentRuleView.vue:15`, `…ListItem.vue:35`, `…ScheduleItem.vue:8`, `FieldDependency/*.vue` (4), `erpnext-integration/ERPNextIntegrationSettings.vue:48,50` | Settings → General, Teams, SLA, Assignment Rules, Field Dependency, ERPNext: switch vertical alignment |
| `ErrorMessage` renders an `Error.messages[]` one line each (previously a comma-joined string) | 17 files import `ErrorMessage` (e.g. `Settings/EmailAdd.vue`, `Settings/EmailEdit.vue`, `components/dialogs.jsx`) | Settings → Email accounts: add or edit with a bad password; any dialog that shows a server error |
| `HoverCard` reimplemented (controlled `open`, `update:open`, `setOpen`/`close` slot props) | same sites as B5 | SLA policy and assignment-rule info hovercards open and close normally |
| `Tabs` (route mode): a clicked tab resets when the route path changes | `ticket-agent/TicketActivityPanel.vue:2`, `pages/contact/Contact.vue:48`, `pages/ticket/TicketCustomer.vue:43`, `pages/ticket/MobileTicketAgent.vue:93`, `pages/customer/Customer.vue:44`. All are `v-model`-driven, not route mode | Ticket activity tabs, contact, customer and mobile ticket tabs switch as before |
| `Dropdown` / `Menu`: item `onClick` no longer fires for switch or submenu options. Item text is `leading-tighter` | 40 `Dropdown` files. No helpdesk option pairs `onClick` with `switch` or `submenu` as far as grep shows | Spot-check the ticket action menus and the view breadcrumbs menu (`ViewBreadcrumbs.vue:142-143` styles `[data-state="checked"]` menu items, which is unchanged) |
| Editor internals: `EditorBubbleMenu`/`EditorFloatingMenu` position through `side/align`; `VideoControls` rewritten; `slashCommands` takes `{items}` | `TextEditor.vue:24`, `CompactEditor.vue:11` (bubble menu, no `options`). `InsertVideo` in `editor/config.ts` toolbars | Select text in a comment and in the KB editor (bubble menu placement). Insert a video and use its controls |
| `useKeyboardShortcut` now throws outside component setup; `combo` accepts a ref | `command-palette/CommandPalette.vue:415`, inside `<script setup>` | ⌘K opens the palette from a filter input and from a dialog |
| Popover gains `autoFocus` (default `true`), `trigger: 'click' \| 'manual'` and `reference`; the trigger is wrapped in `PopoverAnchor` | 17 `Popover` files, including `frappe-ui/PhoneControl/PhoneControl.vue:13` and `view-controls/filter/Filter.vue` | Phone field flag picker, filter popover, sort popover: focus on open and position |

---

## (c) Backend coupling

- **Resources (`createResource`, `createListResource`, `createDocumentResource`), `call()`, `frappeRequest`:** no change on the wire. The diff is type names only: `FrappeRequestError` → `FrappeResourceError`, and the `CallError` alias is gone. `src/resources/index.ts` turns its `export *` into named exports and every helpdesk import is still there. Helpdesk's `setConfig("resourceFetcher")` and `setConfig("fallbackErrorHandler")` (`main.js:40,63`) are untouched.
- **`FrappeUI` plugin:** `resources` is `boolean` now. Helpdesk calls `app.use(FrappeUI)` with no options (`main.js:73`), so it is unaffected.
- **File uploader:** it sends the same request. Changes:
  - uploads reject with `UploadError` (`kind: file-size | network | server | abort`)
  - an aborted upload no longer rejects with a `DOMException`
  - the `is_private` option is removed; only `private` exists
  Helpdesk passes `private` (`src/utils.ts:530-544`), never branches on the error type, and the `FileUploader` component did not change. The editor's media engine checks `signal.aborted`, not the error class.
- **Realtime:** `realtime` is now a named export, `onDocUpdate`. No behaviour change. Helpdesk runs its own `src/socket.ts`.
- **Mentions: the one real backend break.** B3 changes the HTML the editor stores (`data-id`). Helpdesk's server side reads it in `helpdesk/utils.py:138 extract_mentions`.
- **v2 data composables** (`useCall`/`useDoc`/`useNewDoc`: writes reject, `refetch` submit semantics, `useDoc` method-name collisions): helpdesk imports none of them, so this is not applicable.
- **Frappe framework side:** `@framework/ui` is the coupling (B12). Nothing in rc.1 needs a newer Frappe Python backend.

---

## (d) Unaffected changes (one line each)

- **Charts v2 family** (`frappe-ui/charts`: `splitBy`, `y2`, `hiddenSlices`, tooltip and select payloads, `NumberCard.format`, locale-aware numbers, …): helpdesk uses only `experimental` `AxisChart`/`DonutChart`/`NumberChart`/`ECharts`, which have **no diff**.
- **`frappe-ui/list` vocabulary** (`data-state`, `#label`, `#sort-indicator`): helpdesk uses `experimental/ListView`. Its only change is `ListFooter`'s default left slot, and helpdesk overrides that (`ListViewBuilder.vue:127`).
- `Tree` keyed expansion: not used.
- `Progress.intervals` and `Divider.align`: not used.
- `Icon.icon` prop: additive.
- `Badge.label` narrowed to `string | number`: helpdesk passes strings and numbers (vue-tsc confirms).
- `Button.link` → `href`: not used.
- Navigation destinations `to` → `route` on `ListRow`/`SidebarItem`/`SidebarRailItem`/`MobileNavItem`, and `PageHeaderBackButton.to` → `fallbackRoute`: helpdesk passes neither `to` nor `PageHeader*`.
- `TabButtons` `tooltip` removed, and the prefix/suffix slot prop `checked` → `active`: not used.
- `Tabs` trigger slot prop `selected` → `active`: not used (helpdesk uses `#tab-label`/`#tab-panel`).
- `Dialog.icon` object → string or component + `theme`, and the `DialogIcon` export removed: no helpdesk dialog passes an icon object.
- `Dialog` `paddingTop` accepts a number: not used.
- `dialog.*` action type `ImperativeDialogAction`: not used. `DialogAction`/`DialogSize` are still exported.
- Toast option types exported, and the documented default of 4000 ms: types only.
- `ErrorMessageValue` and array errors on inputs: additive.
- `FrappeUIError`, `resolvedColorScheme` (now a ref on `useColorScheme()`), `ScrollBar`, `useSheetDrag`, `isPrivateUpload`, `UploadPrivacy`: helpdesk imports none of them.
- `useShellScrolled` threshold, `DesktopShell :scroll`, shell injection, `--mobile-header-height`: not used.
- `TimePicker` emits removed, `DateTimePicker.allowCustomTime` removed, picker trigger slot `toggle` removed: not used (no custom picker `#trigger`).
- `FormControl` no longer forwards `variant` to a checkbox: no helpdesk `FormControl type="checkbox"` passes `variant`.
- `Select`/`Combobox`/`MultiSelect` `Emits` interfaces drop the model events: helpdesk never indexes them.
- `SelectionOption`, `SelectionGroup`, `Dayjs`, `DateRangeValue`, `InputExposed`, `PickerExposed`, `RouteDestination`, `TabButtonsExposed`: additive types.
- Editor: `EditorFixedMenu.buttonSize` → `size`, and menu `placement` → `side`/`align`: helpdesk passes neither (`EditorFixedMenu :items` only).
- Editor: `StarterKit` `code`/`codeBlock`/`link` keys, `InlineKit.starterKit`, `slashCommands { items }`: not used.
- Editor: `UploadedFile` → `UploadedMedia` (editor subpath). Helpdesk imports the **root** `UploadedFile` (`BulkReplyModal.vue:46`, `CompactEditor.vue:63`), which keeps its name and is now a type alias that fits `uploadFunction`.
- Editor: mentions open after brackets and quotes; `Editor.extensions` takes TipTap `Extensions`: behaviour-neutral or additive.
- Code editor family at `frappe-ui/code-editor`: helpdesk doesn't use it directly (`@framework/ui` does; see B12). `codeLanguages` stubs any uninstalled `@codemirror/lang-*`.
- `frappe-ui/vite` `lucideIcons` defaults to `false`: helpdesk passes `lucideIcons: true` (`vite.config.js:23`).
- `frappe-ui/vite` also has the new `codeLanguages` plugin. `jinjaBootData`, `buildConfig`, `frappeTypes` and `frappeProxy` have no diff.
- Package contract:
  - the `tailwindcss` peer `>=3.4.2 <4` is met (helpdesk has `^3.4.15`, and 3.4.19 is installed)
  - the tarball ships no tests or stories
  - `style.css` gains a `style` condition
  - the `frappe-ui/src/utils/tailwind.config` shim is deleted, and helpdesk doesn't use it
- `frappe-ui/tailwind` `content` now includes `experimental/ListView`. Helpdesk's own extra glob for it (`tailwind.config.js:11`) becomes redundant, and harmless.
- Token files move to `tailwind/tokens/*.js`, and `frappe-ui/tailwind/tokens` exports them: helpdesk reads no token file.
- `--focus-*` box-shadow variables removed, `rounded-9` is 100px, `min-w-50` and `w-wizard` changed: the compiled-CSS diff shows helpdesk uses none of them.
- The sizing scale is now derived from spacing: no helpdesk class changed value (CSS diff).
- The lucide mask selector is `.lucide-x:where(:not(svg))`: helpdesk's `lucide-*` classes sit on `<span>`s, and its `~icons/lucide/*` SVGs carry no `lucide-*` class.
- `frappe-ui` dependencies dropped (`prosemirror-tables`, `@tailwindcss/line-clamp`, several `@tiptap/extension-*`):
  - `prosemirror-tables` still installs through `@tiptap/pm`, so helpdesk's `dedupe` and `optimizeDeps.include` still resolve
  - `line-clamp` has been in Tailwind core since 3.3
- The `frappe-ui/editor-style.css` alias in `vite.config.js`: its target `src/molecules/editor/style.css` still exists in rc.1. `@framework/ui` on frappe `origin/develop` no longer imports that subpath, so the alias can go later. That is not needed for parity.
- `CommandPalette`, `Calendar`, `FloatingWindow` and `TextEditor` (v0) under `experimental`: helpdesk doesn't import them.
- The `node >=20.19.0` engine is unchanged.

---

## Notes for the map

- **Vite:** rc.1 declares `vite >=5` as an **optional** peer. I found no Vite-5-only API in `frappe-ui/vite` at rc.1: the new `codeLanguages` plugin uses `resolveId`/`load` and `optimizeDeps.esbuildOptions`. So the peer declaration is the only thing forcing Vite 5, and yarn v1 would only warn about it. The planned "Vite 5 first" order is safe. Nothing beyond Vite 5 is required.
- **Codemods shipped in rc.1** (`npx -p frappe-ui@1.0.0-rc.1 <name> --dry-run`) can be used as hunting aids:
  - `overlays-v1` covers B1 (Popover `toggle`) and B5 (delay units)
  - `editor-v1` covers B2 only partly: it reports suggestion `component`
  - no codemod covers B3, B6–B11 or B12
- **The lockstep with `apps/frappe` (B12) is the top risk.** It is a bench-state change, not a helpdesk commit. It needs its own ticket or a line in the map's hazards.
- **B10 (line height) and B11 (hover) need a decision from Sydney** between a one-line config opt-out in `desk/tailwind.config.js` and per-site fixes. The config opt-out is the strict-parity, smallest diff.
