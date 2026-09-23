# Does the build survive Vite 5?

Research for ticket **02 — Does the build survive Vite 5?** (map: frappe-ui beta.63 → rc.1).
Base: helpdesk `upstream/develop` @ `1436448b6`. frappe-ui tags `v1.0.0-beta.63`, `v1.0.0-rc.1`. Date: 2026-09-23.

## Verdicts

| # | Question | Answer |
|---|---|---|
| 1 | Does rc.1's `frappe-ui/vite` plugin (or its imports) need Vite ≥ 6? | **No.** Vite 5 is enough. Checked in the source, and an rc.1 + Vite 5.4.21 build passes. |
| 2 | Vite-5-compatible plugin versions | `@vitejs/plugin-vue ^4.6.2`, `@vitejs/plugin-vue-jsx ^3.1.0`, `vite-plugin-pwa 0.17.5`. The two `@vitejs` plugins already resolve to Vite-5-capable versions in today's lockfile. |
| 3 | Vite 4 → 5 breaks that touch `vite.config.js` / `vite-helpers.ts` | **No config edits needed.** One behaviour change: SVGs under 4 KiB are now inlined (details below). |
| 4 | Does beta.63 run on Vite 5, so the Vite bump can land first? | **Yes**, as long as `apps/frappe` is from **before** frappe `3394a6cc3c` (see the hazard below). |

## Exact dependency set (desk/package.json)

```diff
-    "@vitejs/plugin-vue": "^4.2.3",
+    "@vitejs/plugin-vue": "^4.6.2",
-    "@vitejs/plugin-vue-jsx": "^3.0.1",
+    "@vitejs/plugin-vue-jsx": "^3.1.0",
-    "vite": "^4.4.9",
-    "vite-plugin-pwa": "0.15.0"
+    "vite": "^5.4.21",
+    "vite-plugin-pwa": "0.17.5"
```

Resolved versions: vite 5.4.21, rollup 4.63.4, esbuild 0.21.5, @vitejs/plugin-vue 4.6.2, @vitejs/plugin-vue-jsx 3.1.0, vite-plugin-pwa 0.17.5, workbox-* 7.4.1.
The dependency commit on this branch (`research/vite5`) is the lockfile generated with the relative `link:../../frappe/ui` in place.

Why each version:

- **vite `^5.4.21`**: the latest 5.x. The floor must be at least **5.4.12**, because `server.allowedHosts` (which helpdesk sets to `true`) first appeared in 5.4.12. That release was the DNS-rebinding fix, `fix!: ... introduce server.allowedHosts` (vite CHANGELOG, 5.4.12). On older 5.x versions the key does not exist.
- **@vitejs/plugin-vue `^4.6.2`**: peer `vite ^4.0.0 || ^5.0.0` (`npm view`). 4.5.0 is the first 4.x with a Vite 5 peer. The lockfile already resolves `^4.2.3` to 4.6.2, so only the floor moves. Moving to 5.x (peer `^5 || ^6`) is optional and not required.
- **@vitejs/plugin-vue-jsx `^3.1.0`**: peer `vite ^4.0.0 || ^5.0.0`. 3.1.0 is the first with that peer, and it is already what the lockfile resolves. Only the floor moves.
- **vite-plugin-pwa `0.17.5`** (exact pin, matching the current style): 0.15.0 peers `vite ^3.1.0 || ^4.0.0`, so it **has** to move. 0.16.7 is the first with `^5.0.0-0`, and 0.17.x is the first with a clean `^5.0.0`. 0.17.5 is the last 0.17.x. Every Vite-5-capable version brings **workbox 6 → 7**. Helpdesk uses `registerType: "autoUpdate"` with the injected `registerSW.js` and never imports `virtual:pwa-register`, and the generated `sw.js` / `workbox-*.js` build fine.
- Other plugins in play need no pin change. `unplugin-auto-import` 19, `unplugin-vue-components` 32 and `unplugin-icons` 22 (frappe-ui deps) declare no `vite` peer. `@framework/ui` peers `vite >=4` and `@vitejs/plugin-vue >=4`.

yarn prints `unmet peer dependency workbox-build@^7 / workbox-window@^7` for vite-plugin-pwa 0.17.5. This is harmless: both are also its direct deps and install at 7.4.1.

## 1. rc.1's `frappe-ui/vite` does not need Vite 6

- `git diff v1.0.0-beta.63 v1.0.0-rc.1 -- vite/` changes only `index.js` and the `.d.ts` files, and adds `codeLanguages.js`. No other plugin file changes.
- The new `codeLanguages()` plugin uses `enforce: 'pre'`, `buildStart`, `resolveId`, `load`, `this.resolve(..., { skipSelf: true })` and a `config()` hook that returns `optimizeDeps.esbuildOptions.plugins`. All of these exist in Vite 4 and 5. None of the Vite 6 APIs appear anywhere in `vite/*.js` at rc.1: no Environment API (`this.environment`, `applyToEnvironment`, `hotUpdate`, `buildApp`) and no Rolldown/Oxc hooks.
- The plugin's imports are `unplugin-auto-import ^19.3.0`, `unplugin-icons ^22.1.0`, `unplugin-vue-components ^32.0.0`, `magic-string`, `es-module-lexer` and `lucide-static`. These are the same versions as beta.63, which already runs on Vite 4 today. None peers `vite`.
- frappe-ui itself develops against vite `^7.3.2` / plugin-vue `^6.0.7` (its devDependencies). That is its own choice; the published peer is `vite >=5`.
- **Empirical:** rc.1 + vite 5.4.21 + frappe `origin/develop` `ui/` (`cc9d0ec5e3`) runs `vite build` to completion: 3766 modules, PWA generated. This build had the beta.63 `patches/` moved aside.
- Default change to know about: rc.1 flips `lucideIcons` to default `false`. Helpdesk passes `lucideIcons: true` explicitly, so nothing changes.

## 3. Vite 4 → 5 breaking changes vs helpdesk config

Sources: the Vite 5 migration guide (vite.dev/guide/migration, v5) and the vite 5.4.21 `CHANGELOG.md`.

| Vite 5 change | Helpdesk exposure | Action |
|---|---|---|
| Node 18 / 20+ | Local `node -v` = v25.2.1. frappe-ui already requires `>=20.19.0` | none |
| CJS Node API deprecated | `desk/package.json` has `"type": "module"` and the config is ESM. No "CJS build of Vite's Node API is deprecated" warning in the build or dev logs | none |
| `__dirname` in ESM config | Vite still injects `__dirname` into the bundled config. `path.resolve(__dirname, …)` works (build passes) | none |
| Rollup 4 (import attributes; `this.resolve` `skipSelf` default `true`) | Not used by helpdesk. frappe-ui passes `skipSelf` explicitly. `@framework/ui`'s `resolveId` resolves against the host `index.html`, so it cannot recurse either way | none |
| `define` / `import.meta.env` replacement rework | Helpdesk has no `define`. It uses only `import.meta.env.DEV` | none |
| `resolve.browserField` removed | not set | none |
| `import.meta.glob` `as` → `query` | no `import.meta.glob` in `desk/src` | none |
| CSS default-import string removed (needs `?inline`) | only side-effect `import "./index.css"` | none |
| `server.allowedHosts` (5.4.12+) | set to `true` | vite floor ≥ 5.4.12 (we use ^5.4.21) |
| `server.proxy`, `server.fs.allow`, `resolve.alias/dedupe`, `optimizeDeps.include/exclude` | unchanged semantics. The dev server boots (`VITE v5.4.21 ready`), and frappeProxy and type generation run | none |
| `feat(build)!: inline SVGs` (#14643, 5.0.0) | `src/assets/images/frappe-mail.svg` (763 B, imported in `Settings/emailConfig.ts`) now becomes a data URI instead of an `assets/` file. Vite 4 skipped `.svg` in `assetsInlineLimit` | behaviour only; add to the affected-areas list: **Settings → Email config logo** |
| esbuild 0.18 → 0.21 | The Vite 4 build printed a CSS-minify warning (`nested style rule cannot start with "li"`). The Vite 5 build does not | none |

`vite-helpers.ts` needs no edit. Its dynamic `import("frappe-ui/vite")` and `existsSync` logic do not touch the Vite API. It imports only the `PluginOption` type, which is still exported in Vite 5.

## 4. beta.63 on Vite 5, and a hazard outside helpdesk

- **beta.63 + Vite 5.4.21 + local `apps/frappe/ui`** (fork branch `7a0c9b6666`, merge-base with frappe develop `2786f2615a`, 2026-09-20): `yarn build` passes and `patches/frappe-ui+1.0.0-beta.63.patch` still applies. Compared with the Vite 4.5.14 baseline, the output files are the same except for the inlined `frappe-mail.svg` and Rollup-4 chunk names for the leaflet CSS. Precache is 164 entries both times.
- **Hazard:** frappe `origin/develop` commit **`3394a6cc3c` (2026-09-22) "fix(ui): build against frappe-ui 1.0.0-rc.1"** changed `@framework/ui` to peer `frappe-ui >=1.0.0-rc.1`. `CodeEditorField.vue` now imports `frappe-ui/code-editor`. Results:
  - beta.63 + frappe develop `ui/` → `Missing "./code-editor" specifier in "frappe-ui" package` (verified). **This fails with or without the Vite bump**: helpdesk `upstream/develop` is already broken against current frappe develop.
  - rc.1 + the older local `ui/` → `"CodeEditor" is not exported by "node_modules/frappe-ui/experimental.ts"` (verified).
  - So the "Vite first on beta.63" commit has to be verified against an `apps/frappe` from **before** `3394a6cc3c`. The frappe-ui rc.1 commit has to be verified against an `apps/frappe` from **after** it. The bench's `apps/frappe` checkout decides which build is green.

## Worktree gotchas found

These matter for any build from `apps/worktrees/helpdesk/<name>/desk`:

- `src/socket.ts` imports `../../../../sites/common_site_config.json`. At worktree depth that path resolves to `apps/worktrees/sites`. A temporary symlink `apps/worktrees/sites → frappe-bench/sites` fixes it.
- The relative `link:../../frappe/ui` resolves to `apps/worktrees/helpdesk/frappe/ui`. With an absolute link the lockfile differs; with a missing target yarn drops `@framework/ui`'s transitive deps (cropperjs, leaflet…) from the lockfile. A temporary symlink `apps/worktrees/helpdesk/frappe → apps/frappe` keeps the committed lockfile correct.
- `buildConfig.outDir` / `indexHtmlPath` are relative (`../helpdesk/public/desk`), so a worktree build writes only inside the worktree.
