# Spike: Importing `frappe/ui` Composer(s) into Studio as a custom component

**Goal:** Use the frappe `EmailComposer` + `CommentComposer` (with the Email⇄Comment switching) inside a Studio page as a custom component.

**Result:** The custom-component plumbing already exists. The real cost is a **frappe-ui version bump inside Studio** — the composer needs frappe-ui APIs that Studio's bundled version doesn't have. Everything else (a wrapper, send-wiring) is downstream of that.

---

## TL;DR

- ✅ Studio can register + build custom Vue components today (doctype + `--custom-components` build flag).
- ❌ The composer requires **`frappe-ui >= 1.0.0-beta.16`** and imports **runtime** values from **`frappe-ui/experimental`**.
- ❌ Studio bundles **`frappe-ui@1.0.0-beta.12`**, which has **no `./experimental` export** and is below the minimum.
- ➡️ Gating task = **upgrade Studio's frappe-ui to ≥ beta.16**, then wrapper + registration + send-wiring.

---

## What already works (no Studio-source hacking needed)

Studio has a first-class custom-component path:

| Piece | Detail |
|---|---|
| API/doctype | `studio.api.get_custom_vue_components(frappe_app)` |
| Editor runtime | `registerCustomVueComponents()` → `defineAsyncComponent(() => import(file_path))` into `customVueComponentsRegistry` |
| Build | `studio/build.py` already emits `--custom-components '{"Name":"/abs/path.vue"}'` from `self.custom_vue_components` |
| Renderer | build generates `import Name from "<path>"` + `app.component("Name", Name)` |
| FS access | vite `server.fs.allow` includes all of `apps/`, so a component can import composer source by path |

**Registering a wrapper = create one custom-vue-component record** (`component_name`, `file_path`, `frappe_app=helpdesk`). That part is easy.

---

## The blocker (real, upstream)

The composer set lives in `apps/frappe/ui` (package name `@framework/ui`) and:

- **requires `frappe-ui >= 1.0.0-beta.16`** (`apps/frappe/ui/package.json`), and
- imports **runtime** values from **`frappe-ui/experimental`**:
  - `FloatingWindow` — `ComposerContent.vue`
  - `MultiEmailInput` — `EmailComposer/RecipientSelect.vue`
  - `WindowMode` (type only) — `Composer.vue`, `composerContext.ts`

Studio bundles **`frappe-ui@1.0.0-beta.12`**:

- `studio/node_modules/frappe-ui` version = `1.0.0-beta.12`
- `exports['./experimental']` = **absent**

➡️ Bundling the composer into the Studio app build will **fail to resolve `frappe-ui/experimental`**, and even if stubbed there is API drift (TextEditor, TabButtons, tokens) between beta.12 and beta.16.

**Gating task: upgrade Studio's frappe-ui (beta.12 → ≥ beta.16, or align to the frappe app's version).** This re-renders Studio's ~60 already-registered components against a newer frappe-ui — the main risk/effort, and it's a change to the Studio app itself.

---

## The composer is a compound / slot / context tree

It is **not** one component. From `apps/frappe/ui/src/components/Composer/index.ts`:

- `Composer` — root; owns shared state (`v-model:open`, `v-model:channel`, `v-model:mode`) and **provides context** to the parts below.
- `ComposerTrigger` — collapsed bar (click to open).
- `ComposerContent` — the floating/docked window.
- `ComposerChannel` — associates slotted content with a channel value; **contributes a switcher tab when >1 channel is present**.
- `EmailComposer` / `CommentComposer` — ready-made channel content (also render inline/standalone).

Intended usage (from `stories/Composer.story.vue`):

```vue
<Composer v-model:open="open" v-model:channel="channel" v-model:mode="mode" :minimizable="minimizable">
  <ComposerTrigger placeholder="Write a reply…" />
  <ComposerContent>
    <ComposerChannel value="email">   <EmailComposer   ... /></ComposerChannel>
    <ComposerChannel value="comment"> <CommentComposer ... /></ComposerChannel>
  </ComposerContent>
</Composer>
```

The switching is a property of the **shared surface context**, not two independent widgets — so it can't be faithfully rebuilt from Studio blocks. Hence a **wrapper (Option C)**.

---

## Required work (even after the version fix)

1. **Wrapper `.vue` (Option C).** Assemble `Composer` + `ComposerTrigger` + `ComposerContent` + both `ComposerChannel`s, and expose a **flat prop/emit API** to Studio (Studio can't reliably drive the compound slot/context tree).
2. **Runtime wiring.** Composer is transport-agnostic ("submit hands back a payload; the host performs the send"). Needs: recipients-search fn, an upload fn, mention options, and a `submit` handler that sends via an email account against a document.

---

## Effort

| Step | Size |
|---|---|
| Bump Studio's frappe-ui to ≥ beta.16 + fix fallout | **Large** (the actual blocker) |
| Wrapper `.vue` (both composers + switch) | Medium |
| Register via custom-vue-component doctype | Small |
| Send-wiring (email account, upload, recipients, submit) | Medium |

---

## Recommendation

- Not a drop-in. **Do the frappe-ui bump first** (throwaway branch; verify existing Studio pages still render), then wrapper + registration, then send-wiring.
- **Question the premise:** a full email/comment Composer belongs in the **agent/ticket surface** (which already hosts it). On a public KB page there's no document to attach a reply to. For "let a visitor contact support," the **New-ticket modal** already built is the right-sized tool; the Composer is for agents replying on a ticket.

---

## Key file references

- Composer source: `apps/frappe/ui/src/components/Composer/` (`Composer.vue`, `ComposerContent.vue`, `ComposerChannel.vue`, `ComposerTrigger.vue`, `EmailComposer/`, `CommentComposer/`, `composerContext.ts`, `index.ts`)
- Min frappe-ui: `apps/frappe/ui/package.json` → `"frappe-ui": ">=1.0.0-beta.16"`
- Studio frappe-ui: `apps/studio/node_modules/frappe-ui/package.json` → `1.0.0-beta.12` (no `./experimental`)
- Custom-component build: `apps/studio/studio/build.py` (`--custom-components`)
- Renderer/registration: `apps/studio/frontend/src/scripts/build.js` (`findComponentSources`, `getRendererContent`)
- Runtime registry: `apps/studio/frontend/src/globals.ts` (`registerCustomVueComponents`, `customVueComponentsRegistry`)
- Custom-component API: `studio.api.get_custom_vue_components`
