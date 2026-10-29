// The Demo Overlay: this visitor's Simulated Actions, kept in IndexedDB and replayed on load.
import { toast } from "frappe-ui";
import { clear, get, set } from "idb-keyval";
import { __ } from "../translation";
import type { Doc } from "./filters";
import { docKey, patched, replay, type Action, type ActionType } from "./replay";
import { callServer } from "./server";
import { demoBoot, isDemo, randomName, siteTimezone } from "./session";

// Bump when the action shapes change; a mismatch wipes the overlay instead of migrating it.
const SCHEMA = 1;
const KEY = "helpdesk_demo_overlay";

class Overlay {
  log: Action[] = [];
  projection = replay([], "UTC");
  refreshed = false;
  private loading: Promise<void> | null = null;

  load() {
    return (this.loading ??= this.restore());
  }

  async record(type: ActionType, payload: Doc): Promise<Action> {
    const action = { id: randomName(), type, at: new Date().toISOString(), payload };
    this.log.push(action);
    this.projection = replay(this.log, siteTimezone());
    await this.save();
    return action;
  }

  isNew(doctype: string, name: unknown) {
    return Boolean(this.projection.docs.get(docKey(doctype, name))?.__new);
  }

  touched(doctype: string, name: unknown) {
    const key = docKey(doctype, name);
    return this.projection.docs.has(key) || this.projection.assigns.has(key);
  }

  touchedNames(doctype: string) {
    const keys = new Set([...this.projection.docs.keys(), ...this.projection.assigns.keys()]);
    return [...keys].filter((key) => key.startsWith(`${doctype}/`)).map((key) => key.slice(doctype.length + 1));
  }

  merge(doctype: string, base: Doc) {
    return patched(this.projection, doctype, base);
  }

  async doc(doctype: string, name: string) {
    const base = this.isNew(doctype, name) ? { name } : await callServer("frappe.client.get", { doctype, name });
    return this.merge(doctype, base);
  }

  // Shown as #201 after a seed of 200 tickets.
  nextTicketName() {
    const created = this.log.filter((a) => a.type === "insert" && a.payload.doctype === "HD Ticket");
    return String(demoBoot()!.max_ticket + created.length + 1);
  }

  private async restore() {
    const stored = await get(KEY);
    if (stored && (stored.schema !== SCHEMA || stored.seed_version !== demoBoot()?.seed_version)) {
      // frappe-ui's resource cache holds overlay rows too
      await clear();
      this.refreshed = true;
    } else {
      this.log = stored?.log ?? [];
    }
    this.projection = replay(this.log, siteTimezone());
  }

  private save() {
    return set(KEY, { schema: SCHEMA, seed_version: demoBoot()?.seed_version, log: this.log });
  }
}

export const overlay = new Overlay();

// Each bundle calls this once its app has mounted, so the toaster is there to show it.
export async function showRefreshNotice() {
  if (!isDemo()) return;
  await overlay.load();
  if (overlay.refreshed) toast(__("The demo was refreshed"));
}

// Clears the overlay and frappe-ui's `keyval-store`, which share idb-keyval's default store, and
// localStorage.
export async function restartDemo() {
  await clear();
  localStorage.clear();
  location.href = /^\/help(\/|$)/.test(location.pathname) ? "/help" : "/helpdesk";
}
