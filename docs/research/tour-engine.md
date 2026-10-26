# Tour engine choice

Research for aerodeval/helpdesk#53 (map #51: Helpdesk live demo).
Question: which guided-tour engine does the demo use? The demo is a Vue 3 +
frappe-ui + Tailwind SPA in `desk/`, with 7 tour stops over several routes, a
"try it" checklist, and a mobile requirement.

Checked on 2026-10-26 against npm, bundlephobia, the GitHub repos, and the
published package sources (`npm pack`).

## Recommendation

**driver.js 1.10.x.** MIT, about 8 KB gzip plus 1 KB CSS, no dependencies.
Since 1.8 it has the two features this demo needs most:

- `waitForElement` (ms): waits for the next step's element with a
  `MutationObserver`. This covers route changes and lazy renders.
- `advanceOnClick`: the step advances when the user clicks the highlighted
  element ("click Assign to continue").

It also ships a `driver.js/checklist` module (1.10, about 2.7 KB gzip). Its items
can start a tour (`tour`) and complete themselves (`completeWhen`). That is the
"try it" checklist from map #51 at no extra cost.

The fallback is a custom engine on the frappe-ui `Popover`. Use it only if the
popover must render real Vue/frappe-ui components and driver's HTML string plus
CSS overrides are not enough. It adds no dependencies, but we must write and own
the overlay, scroll, wait, keyboard and checklist logic (see below).

Do not use shepherd.js or intro.js: both are AGPL-3.0 with a paid commercial
license, and the demo is a sales funnel.

## Comparison

| | driver.js 1.10.2 | shepherd.js 15.3.0 | intro.js 8.6.0 | Custom (frappe-ui Popover / reka-ui) |
|---|---|---|---|---|
| Size, min+gzip | 8.0 KB JS [1] + 1.1 KB CSS; checklist +2.7 KB | 15.3 KB [1] (includes `@floating-ui/dom`, `deepmerge-ts`) | 19.2 KB [1] | ~0 new KB: frappe-ui 1.0.0-rc.1 already pulls reka-ui 2.10, `@floating-ui/vue`, `@vueuse/core` [6] |
| License | MIT [2] | AGPL-3.0 **or commercial**. "Commercial use" needs a paid license per `LICENSE.md` [3] | AGPL-3.0 **or commercial**. A commercial project needs a paid license per `license.md` [4] | Ours (helpdesk is AGPL-3.0) |
| Vue 3 fit | Framework-agnostic imperative API (`driver({steps}).drive()`). Wrap it in one composable. | Agnostic. `vue-shepherd` 6.0.0 wrapper (AGPL) | Agnostic. No official Vue 3 wrapper | Native. Steps can be SFCs and use frappe-ui `Button`, tokens, i18n |
| Mobile / touch | Own positioning code (no floating-ui). `scrollIntoView` centers the target, `block: start` if the target is taller than the viewport [5]. 1.10.2 also scrolls targets inside scroll containers [7] | Floating UI positioning (flip/shift). `scrollTo` option | `scrollToElement`, `scrollTo` options | reka `collisionPadding` + flip. Can swap to frappe-ui `BottomSheet` on narrow screens. We write the scroll logic |
| Multi-route steps | `onNextClick` hook: `router.push()`, then `driver.moveNext()`. `waitForElement` covers the render gap. The popover hides while it waits (1.9) [7] | `beforeShowPromise` resolves after navigation | `onbeforechange` may return a Promise | `await router.push()` then our own wait |
| Wait for element | Yes: `waitForElement` (MutationObserver + timeout), `skipMissingElement` [5][7] | No built-in. Do it in `beforeShowPromise` | No built-in. Do it in `onbeforechange` | `useMutationObserver` / `until()` from `@vueuse/core` (installed) |
| Wait for user action | `advanceOnClick` (click on the target). For other actions, call `moveNext()` from app code | `advanceOn: {selector, event}`, any DOM event | None. Call `nextStep()` from app code | Our own code |
| A11y | Popover `role="dialog"`, `aria-labelledby/describedby`. Tab is trapped between the popover and the highlighted element. Esc closes. Arrow keys navigate. `closeBtnLabel` (1.9) [5][7] | Tab trap in the step, Esc (`exitOnEsc`), arrows (`keyboardNavigation`) [3] | Esc (`exitOnEsc`), arrows (`keyboardNavigation`). No Tab trap found in 8.6.0 source | reka gives Esc + `role="dialog"`. Non-modal Popover (the default, `modal: false`) has **no** focus trap. `modal: true` traps but blocks clicks on the target. Tab cycling between popover and target is ours |
| Styling control | `popoverClass` per tour or step. Plain CSS classes (`.driver-popover*`), can be overridden with Tailwind `@apply` and frappe-ui CSS variables. `--driver-popover-font-family`. `onPopoverRender` gives raw DOM to add buttons. Content is an HTML string, not a Vue component | Plain CSS + `classes`. Text/HTML content | Themes + CSS | Full: frappe-ui tokens and components |
| Maintenance | ~27k stars. 6 releases Jun–Oct 2026, last 2026-10-18 [7] | ~13.8k stars, active | ~23k stars, last push 2026-09 | Us |

[1]–[7]: see Sources.

## Why driver.js over custom

The custom engine is the "already-installed deps" option, so we checked what it
must build. frappe-ui `Popover` already supports `trigger="manual"` and a
`reference: Element` prop. It anchors to any element with reka + floating-ui
collision handling, and closes on Esc unless `dismissible` is false [6]. That
covers the step card only. We would still write and test:

1. A spotlight overlay: a fixed cutout around `useElementBounding(target)` that
   follows scroll and resize.
2. Scroll-into-view inside nested scroll containers. The helpdesk agent UI
   scrolls inside panes, not the window. driver.js fixed this case in 1.10.2.
3. Wait-for-element with a timeout and a cancel when the tour is closed
   mid-wait.
4. Focus handling. A non-modal reka popover does not trap focus, and a modal
   one blocks clicks on the target. driver.js traps Tab between the popover and
   the target, so "click Assign" still works with the keyboard.
5. The checklist UI and its progress persistence.

That is a few hundred lines of interaction code with edge cases, against 11 KB
of MIT code that already handles them. The demo branch is never PR'd upstream,
so a new dependency does not affect upstream review.

## Integration sketch (for the build ticket)

- `desk/src/demo/tour.ts`: one composable that calls `driver({ steps, ... })`.
  Steps target `[data-tour="..."]` anchors (map #51 code shape).
- Route stops: on a step whose next stop is on another route, set
  `onNextClick: () => router.push(next.route).then(() => d.moveNext())` and
  `waitForElement: 3000`.
- "Do it" steps: `advanceOnClick: true`. For non-click actions (for example
  "send a reply"), the overlay layer calls `d.moveNext()` after the simulated
  write.
- Theme: one CSS block mapping `.driver-popover`, its title, description,
  footer and buttons to frappe-ui tokens. Use `overlayColor` / `overlayOpacity`
  for the backdrop. Import `driver.js/dist/driver.css` before it.
- Mobile: `side: "bottom"`, `align: "center"` on narrow screens. Use a
  centered popover with no `element` for stops whose target is hidden on
  mobile. The reflow-vs-separate-sequence question in map #51 stays open.
- Checklist: `checklist({ id, items })` from `driver.js/checklist`, with
  `completed` read from and `onProgress` written to the demo overlay in
  localStorage.

Open risk: driver's popover content is an HTML string. If the design audit
needs frappe-ui components inside the card (for example a real `Button` with
an icon), use `onPopoverRender` to mount a small Vue `render()` into
`popover.description`. If that gets messy, move to the custom engine.

## Sources

1. bundlephobia API, `size?package=` driver.js 1.10.2, shepherd.js 15.3.0,
   intro.js 8.6.0; gzip of the packed `dist/*.mjs`, `driver.css`, `checklist.mjs`.
2. npm registry `license` fields; GitHub `kamranahmedse/driver.js` license: MIT.
3. `shipshapecode/shepherd` `LICENSE.md` (dual AGPL-3.0 / commercial);
   `shepherd.js@15.3.0` `dist/js/shepherd.d.mts` (`advanceOn`, `beforeShowPromise`,
   `exitOnEsc`, `keyboardNavigation`, `scrollTo`); Tab handling in `shepherd.mjs`.
4. `usablica/intro.js` `license.md`; `intro.js@8.6.0` `src/packages/tour/callback.d.ts`
   (Promise-returning `onbeforechange`), `option.d.ts`.
5. `driver.js@1.10.2` `dist/driver.js.d.ts` (Config, DriveStep, Driver) and
   `dist/driver.js.mjs` (Tab trap, `scrollIntoView`, MutationObserver wait,
   aria attributes).
6. `desk/node_modules/frappe-ui` 1.0.0-rc.1: `package.json` (reka-ui ^2.9.9,
   `@floating-ui/vue`, `@vueuse/core`), `src/components/Popover/{Popover.vue,types.ts}`;
   reka-ui 2.10.4 `PopoverRootProps.modal` (default `false`).
7. GitHub releases `kamranahmedse/driver.js` 1.7.0–1.10.2 (changelogs for
   `skipMissingElement`, `waitForElement`, `advanceOnClick`, hints, checklist,
   scroll-container fix, `closeBtnLabel`).
