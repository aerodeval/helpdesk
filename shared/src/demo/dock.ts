// What the demo dock links to.
import type { Persona } from "./session";

export const TRIAL_URL = "https://cloud.frappe.io/dashboard/signup?product=helpdesk";
export const SALES_URL = "https://frappe.io/contact-us?product=Frappe%20Helpdesk";

export function loginUrl(persona: Persona) {
  return `/api/method/helpdesk.demo.persona.login_as_${persona}`;
}
