// Reads the demo makes for itself. Captured before index.ts wraps `fetch`, so they skip the interceptor.
import type { Doc } from "./filters";

export const realFetch = window.fetch.bind(window);

// GET, so no CSRF token is needed in either bundle.
export async function callServer(method: string, params: Doc = {}): Promise<any> {
  const query = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)])
  );
  const response = await realFetch(`/api/method/${method}?${query}`, {
    headers: { Accept: "application/json", "X-Frappe-Site-Name": location.hostname },
  });
  if (!response.ok) throw new Error(`${method}: ${response.status}`);
  return (await response.json()).message;
}

// Read once from the real HD Settings. Customers cannot read it, so they get the defaults.
export const settings = once(() =>
  callServer("frappe.client.get_value", {
    doctype: "HD Settings",
    fieldname: ["auto_update_status", "update_status_to", "ticket_reopen_status", "default_priority", "default_ticket_status"],
  }).catch(() => ({}))
);

export const agents = once(async () => {
  const rows = await callServer("frappe.client.get_list", {
    doctype: "HD Agent",
    fields: ["name", "agent_name", "user_image", "availability", "availability_changed_on"],
    limit_page_length: 0,
  }).catch(() => []);
  return Object.fromEntries(rows.map((agent: Doc) => [agent.name, agent])) as Record<string, Doc>;
});

// A Frappe param that may arrive as a JSON string (GET, `call()` with stringified args).
export function jsonParam(value: unknown): any {
  if (typeof value !== "string" || !/^[[{"]/.test(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function once<T>(load: () => Promise<T>) {
  let value: Promise<T> | null = null;
  return () => (value ??= load());
}
