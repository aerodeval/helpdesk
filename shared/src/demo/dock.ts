// What the demo dock links to, and the menu hooks other demo features fill in.
import { shallowReactive } from "vue";
import type { Persona } from "./session";

export const TRIAL_URL = "https://cloud.frappe.io/dashboard/signup?product=helpdesk";
export const SALES_URL = "https://frappe.io/contact-us?product=Frappe%20Helpdesk";

// The dock lists "Resume tour" and "Things to try" only once these are set
export const dockActions = shallowReactive<{ resumeTour?: () => void; showChecklist?: () => void }>({});

export function loginUrl(persona: Persona) {
  return `/api/method/helpdesk.demo.persona.login_as_${persona}`;
}
