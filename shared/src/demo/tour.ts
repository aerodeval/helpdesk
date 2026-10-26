// Runs the guided tour: the reducer's state, saved with the Demo Overlay, drawn with driver.js.
// The desk and the portal each pass a host that knows their pages and anchors.
import { driver, type Driver } from "driver.js";
import { toast } from "frappe-ui";
import { createApp, shallowReactive, type App } from "vue";
import { dockActions, loginUrl } from "./dock";
import { overlay } from "./overlay";
import type { Action } from "./replay";
import type { Persona } from "./session";
import TourCard from "./TourCard.vue";
import { initialState, isWaiting, stepAt, tourReducer, type StepId, type TourAction, type TourState } from "./tourScript";

export interface Stop {
  // `data-tour` names, in the order the visitor reaches them: the last one on screen is shown
  anchors?: () => string[];
  // the page the step happens on, if it has one
  page?: { go: () => unknown; matches: () => boolean };
  // does the step's Simulated Action for the visitor
  showMe?: () => Promise<unknown>;
}

export interface TourHost {
  persona: Persona;
  stops: Partial<Record<StepId, Stop>>;
  navigate: (to: unknown) => unknown;
  // what a visitor action in the overlay or a route change completes, if anything
  actionDone?: (action: Action) => string | undefined;
  routeDone?: () => string | undefined;
  onRoute: (callback: () => void) => void;
  showChecklist?: () => void;
}

// What the card shows; TourCard reads it, so a state change redraws the card in place.
// Shallow: the reducer replaces the state whole, and IndexedDB cannot clone a reactive proxy.
export const card = shallowReactive({
  state: initialState(),
  showingMe: false,
  hasShowMe: false,
  dispatch: (_action: TourAction) => {},
  showMe: () => {},
  finish: (_url?: string) => {},
});

// Shown when no anchor turns up in time.
const ANCHOR_WAIT_MS = 4000;

class Tour {
  private host!: TourHost;
  private driver: Driver | null = null;
  private cardApp: App | null = null;
  private anchor: Element | null = null;
  private shownStep = -1;
  private observer = new MutationObserver(() => this.queueRefresh());
  private refreshQueued = false;

  get state() {
    return card.state;
  }

  async start(host: TourHost) {
    this.host = host;
    await overlay.load();
    card.state = overlay.tour ?? initialState(host.persona);
    Object.assign(card, {
      dispatch: (action: TourAction) => this.dispatch(action),
      showMe: () => this.showMe(),
      finish: (url?: string) => this.finish(url),
    });
    overlay.onRecord((action) => this.did(host.actionDone?.(action)));
    host.onRoute(() => this.onRoute());
    keepTabInDialogs();

    if (card.state.persona !== host.persona) this.did(`switch_to_${host.persona}`);
    else if (card.state.tour === "not_started" && host.persona === "customer") this.dispatch({ type: "START_INTRO" });
    else this.update();
  }

  dispatch(action: TourAction) {
    const before = card.state;
    card.state = tourReducer(before, action);
    overlay.saveTour(card.state);
    const { tour, notice } = card.state;
    if (notice && tour !== before.tour && ["paused", "dismissed"].includes(tour)) toast(notice);
    this.update();
  }

  did(what?: string) {
    if (what) this.dispatch({ type: "DO", what });
  }

  private onRoute() {
    this.did(this.host.routeDone?.());
    const page = this.stop()?.page;
    if (this.isShown() && card.state.tour === "running" && page && !page.matches()) {
      this.dispatch({ type: "WANDER" });
    } else {
      this.queueRefresh();
    }
  }

  private update() {
    const { state } = card;
    dockActions.resumeTour = ["paused", "dismissed"].includes(state.tour)
      ? () => this.dispatch({ type: "RESUME" })
      : undefined;
    dockActions.showChecklist = this.host.showChecklist;
    const step = stepAt(state);
    if (state.tour === "running" && step.persona !== this.host.persona) {
      // the next step is on the other persona's side: the step's page is there
      location.assign(loginUrl(step.persona));
      return;
    }
    const page = this.stop()?.page;
    if (this.isShown() && page && !page.matches()) this.host.navigate(page.go());
    this.render();
  }

  private isShown() {
    const { tour } = card.state;
    const step = stepAt(card.state);
    if (step.persona !== this.host.persona) return false;
    return tour === "running" || tour === "finished_card" || (tour === "not_started" && step.id === "welcome");
  }

  private stop() {
    return this.host.stops[stepAt(card.state).id];
  }

  private async render() {
    if (!this.isShown()) return this.hide();
    card.hasShowMe = Boolean(this.stop()?.showMe) && isWaiting(card.state);
    const step = card.state.step;
    const anchor = this.pickAnchor() ?? (await this.waitForAnchor());
    if (step !== card.state.step || !this.isShown()) return;
    if (anchor === this.anchor && step === this.shownStep && this.driver?.isActive()) {
      return this.driver.refresh();
    }
    this.anchor = anchor;
    this.shownStep = step;
    this.highlight(anchor);
  }

  private highlight(anchor: Element | null) {
    this.driver ??= driver({
      animate: true,
      allowClose: false,
      allowKeyboardControl: false,
      overlayClickBehavior: "none",
      stagePadding: 6,
      stageRadius: 8,
      popoverOffset: 8,
    });
    this.driver.highlight({
      element: anchor ?? undefined,
      popover: {
        side: anchor ? sideOf(anchor) : undefined,
        popoverClass: anchor && isLowOnScreen(anchor) ? "demo-tour-card demo-tour-card-top" : "demo-tour-card",
        onPopoverRender: (popover) => this.mountCard(popover.wrapper),
      },
    });
    this.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
  }

  private mountCard(wrapper: HTMLElement) {
    this.cardApp?.unmount();
    // the card brings its own title, text and buttons
    const host = document.createElement("div");
    wrapper.replaceChildren(host);
    this.cardApp = createApp(TourCard);
    this.cardApp.mount(host);
  }

  private hide() {
    this.observer.disconnect();
    this.cardApp?.unmount();
    this.cardApp = null;
    this.driver?.destroy();
    this.anchor = null;
    this.shownStep = -1;
  }

  // An anchor further along the path appears, or the shown one leaves the page.
  private queueRefresh() {
    if (this.refreshQueued) return;
    this.refreshQueued = true;
    requestAnimationFrame(() => {
      this.refreshQueued = false;
      if (!this.isShown()) return;
      if (this.pickAnchor() !== this.anchor || (this.anchor && !this.anchor.isConnected)) this.render();
    });
  }

  private pickAnchor() {
    const names = this.stop()?.anchors?.() ?? [];
    return names.map(findAnchor).filter(Boolean).at(-1) ?? null;
  }

  private waitForAnchor() {
    if (!this.stop()?.anchors?.().length) return Promise.resolve(null);
    return waitForElement(() => this.pickAnchor(), ANCHOR_WAIT_MS);
  }

  private async showMe() {
    card.showingMe = true;
    try {
      await this.stop()?.showMe?.();
    } finally {
      card.showingMe = false;
    }
  }

  private finish(url?: string) {
    this.dispatch({ type: "FINISH" });
    if (url) location.assign(url);
  }
}

export const tour = new Tour();
export { EXTRAS, STOP_LABELS, STOPS } from "./tourScript";

// The ticket the visitor raised as the customer, which lands in the agent's inbox.
export function newTicketName(): string | undefined {
  return overlay.log.findLast((a) => a.type === "insert" && a.payload.doctype === "HD Ticket")?.payload.doc.name;
}

export function findAnchor(name: string) {
  const element = document.querySelector(`[data-tour="${name}"]`);
  return element && element.getClientRects().length ? element : null;
}

// Resolves with what `find` returns once it returns something, or null after `timeout`.
export function waitForElement(find: () => Element | null, timeout: number): Promise<Element | null> {
  return new Promise((resolve) => {
    const done = (element: Element | null) => {
      observer.disconnect();
      clearTimeout(timer);
      resolve(element);
    };
    const observer = new MutationObserver(() => {
      const element = find();
      if (element) done(element);
    });
    const timer = setTimeout(() => done(find()), timeout);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  });
}

// Beside a sidebar item, above anything low on screen, below the rest. driver.js flips it to fit.
function sideOf(anchor: Element) {
  if (/^(nav|view)-/.test((anchor as HTMLElement).dataset.tour!)) return "right";
  return isLowOnScreen(anchor) ? "top" : "bottom";
}

// On a phone the card is a sheet; it moves to the top when the anchor sits in the bottom half.
function isLowOnScreen(anchor: Element) {
  const { top, bottom } = anchor.getBoundingClientRect();
  return (top + bottom) / 2 > window.innerHeight / 2;
}

// driver.js traps Tab between its card and the anchor; a dialog the step opens keeps its own Tab.
// Registered before driver's window listener, so it runs first.
let tabKept = false;
function keepTabInDialogs() {
  if (tabKept) return;
  tabKept = true;
  window.addEventListener("keydown", (event) => {
    const dialog = (document.activeElement as HTMLElement | null)?.closest("[role=dialog]");
    if (event.key === "Tab" && dialog && !dialog.classList.contains("driver-popover")) {
      event.stopImmediatePropagation();
    }
  });
}
