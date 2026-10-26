// The Demo Overlay: this visitor's Simulated Actions, kept in IndexedDB and replayed on load.
import { toast } from "frappe-ui";
import { clear, get, set } from "idb-keyval";
import { __ } from "../translation";
import type { Doc } from "./filters";
import { docKey, patched, replay, type Action, type ActionType } from "./replay";
import { callServer } from "./server";
import { demoBoot, randomName, siteTimezone } from "./session";

// Bump when the action shapes change; a mismatch wipes the overlay instead of migrating it.
const SCHEMA = 1;
const KEY = "helpdesk_demo_overlay";

class Overlay {
  log: Action[] = [];
  projection = replay([], "UTC");
  private loading: Promise<void> | null = null;

  load() {
    return (this.loading ??= this.restore());
  }

  async record(type: ActionType, payload: Doc): Promise<Action> {
    const action = { id: randomName(), type, at: new Date().toISOString(), payload };
    this.log.push(action);
    this.projection = replay(this.log, siteTimezone());
    await set(KEY, { schema: SCHEMA, seed_version: demoBoot()?.seed_version, log: this.log });
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
      // the toaster mounts with the app, after this runs
      setTimeout(() => toast(__("The demo was refreshed")), 2000);
    } else {
      this.log = stored?.log ?? [];
    }
    this.projection = replay(this.log, siteTimezone());
  }
}

export const overlay = new Overlay();

// Clears the overlay and frappe-ui's `keyval-store`, which share idb-keyval's default store.
export async function restartDemo() {
  await clear();
  location.href = /^\/help(\/|$)/.test(location.pathname) ? "/help" : "/helpdesk";
}
