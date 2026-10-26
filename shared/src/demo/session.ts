// Page globals the demo reads; the desk and the Studio portal boot them differently.
import type { Doc } from "./filters";

const page = window as any;
// `settings`, `slas` and `customer_slas` carry what a customer cannot read (see demo/persona.py)
const DEFAULT_BOOT = {
  seed_version: "0",
  max_ticket: 900000,
  settings: {} as Doc,
  slas: {} as Record<string, Doc[]>,
  customer_slas: {} as Record<string, string | null>,
};

export function demoBoot(): typeof DEFAULT_BOOT | null {
  const demo = page.demo ?? page.boot?.demo;
  if (!demo) return null;
  // until helpdesk_demo boots both keys
  return { ...DEFAULT_BOOT, ...(typeof demo === "object" ? demo : {}) };
}

export function isDemo() {
  return demoBoot() !== null;
}

// Frappe sets these cookies on login, for both bundles.
export function sessionUser() {
  const email = cookie("user_id") || "Guest";
  return { email, fullname: cookie("full_name") || email, image: cookie("user_image") || null };
}

export function siteTimezone(): string {
  return (
    page.timezone?.system ??
    page.boot?.system_timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
}

// Calls the page's own socket listeners; emitting would reach the server.
export function emitLocal(event: string, payload: unknown) {
  const app = (document.querySelector("#app") as any)?.__vue_app__;
  const socket = app?.config.globalProperties.$socket ?? app?._context.provides.socket;
  socket?.listeners(event).forEach((listener: (data: unknown) => void) => listener(payload));
}

// a hash like Frappe's; randomUUID needs a secure context, which a plain-http site is not
export function randomName() {
  return Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, "0")).join("");
}

function cookie(name: string) {
  const value = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1];
  return value ? decodeURIComponent(value).replace(/^"|"$/g, "") : "";
}

