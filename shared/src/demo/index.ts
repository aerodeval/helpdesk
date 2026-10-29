// The demo interceptor. Import it first in each bundle: it wraps `fetch` and the upload XHR so
// Simulated Actions land in the Demo Overlay and never reach the server. Inert without boot `demo`.
import { toast } from "frappe-ui";
import { createApp } from "vue";
import { __ } from "../translation";
import type { Doc } from "./filters";
import BlockedNotice, { raiseNotice } from "./BlockedNotice.vue";
import { overlay } from "./overlay";
import { reads } from "./reads";
import { realFetch } from "./server";
import { demoBoot, isDemo, randomName } from "./session";
import { BLOCKED, writes } from "./writes";

export { CHECKLIST, dockActions, loginUrl } from "./dock";
export { demoBoot, isDemo } from "./session";
export { restartDemo, showRefreshNotice } from "./overlay";

// Every Blocked Action ends here, as a 403 body, and raises the Blocked Notice banner. The caller's
// own error handling toasts the 403 message too; the banner says it better, so that toast goes.
export function onBlocked(_action: string) {
  const copy =
    demoBoot()?.persona === "customer"
      ? __("That works on a real help center")
      : __("That works on your own Helpdesk");
  showBlocked(copy);
  dropCallerToast(copy);
  return { exc_type: "PermissionError", _error_message: copy };
}

let noticeMounted = false;
function showBlocked(copy: string) {
  if (!noticeMounted) createApp(BlockedNotice).mount(document.body.appendChild(document.createElement("div")));
  noticeMounted = true;
  raiseNotice(copy);
}

// ponytail: watches for 2s, a caller that toasts later keeps its toast
function dropCallerToast(copy: string, frames = 120) {
  const shown = toast.getToasts().find((t: any) => [t.title, t.description].some((part) => text(part).includes(copy)));
  if (shown) toast.dismiss(shown.id);
  else if (frames) requestAnimationFrame(() => dropCallerToast(copy, frames - 1));
}

// frappe-ui wraps a string message in a render function
function text(part: unknown): string {
  if (typeof part === "string") return part;
  return typeof part === "function" ? (part() as any)?.props?.innerHTML ?? "" : "";
}

type Call = { method: string; params: Doc; write: boolean };

// Last segment of a method that changes data. Classified by name: frappe-ui POSTs reads too.
const WRITE = /^(add|apply|assign|bulk|cancel|change|clear|create|delete|disable|dislike|duplicate|enable|import|insert|invite|like|mark|merge|move|new|pin|publish|react|remove|rename|reset|save|send|set|split|submit|toggle|unpin|update|upload|vote)(_|docs$|$)/;

const page = window as any;
// Vite's HMR re-runs this module; wrapping twice would stack the fakes
if (!page.__helpdeskDemo) {
  page.__helpdeskDemo = true;
  window.fetch = interceptFetch;
  interceptUpload();
}

async function interceptFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = isDemo() ? parse(input, init) : null;
  if (!request) return realFetch(input, init);
  await overlay.load();
  const fake = writes[request.method];
  if (fake) {
    const body = await fake(request.params);
    return body === BLOCKED ? blocked(request) : json(body);
  }
  if (request.write) return blocked(request);
  return read(request, () => realFetch(input, init));
}

async function read({ method, params }: Call, pass: () => Promise<Response>) {
  const handler = reads[method];
  const own = await handler?.own?.(params);
  if (own !== undefined) return json({ message: own });
  const response = await pass();
  if (!handler?.merge || !response.ok) return response;
  const body = await response.json();
  return json({ ...body, message: await handler.merge(body.message, params) });
}

function parse(input: RequestInfo | URL, init?: RequestInit): Call | null {
  const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
  const match = url.pathname.match(/^\/api\/(v2\/)?(method|resource|document)\/(.+)$/);
  if (url.origin !== location.origin || !match) return null;
  const http = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const method = decodeURIComponent(match[3]!);
  if (match[2] !== "method") return { method, params: {}, write: http !== "GET" };
  const params: Doc = body(init?.body);
  url.searchParams.forEach((value, key) => (params[key] ??= value));
  // v2 answers in another envelope, so its writes are blocked rather than faked
  if (match[1]) return { method: `v2:${method}`, params, write: http !== "GET" || isWrite(method) };
  return { method, params, write: isWrite(method) };
}

function isWrite(method: string) {
  return method === "run_doc_method" || WRITE.test(method.split(".").pop()!);
}

function body(value: unknown): Doc {
  if (typeof value !== "string") return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function blocked({ method, params }: Call) {
  return json(onBlocked(method === "run_doc_method" ? params.method : method), 403);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// frappe-ui uploads through XMLHttpRequest, which `fetch` never sees.
function interceptUpload() {
  const { open, send } = XMLHttpRequest.prototype;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest & Doc, ...args: any[]) {
    this.demoUrl = String(args[1]);
    return (open as any).apply(this, args);
  };
  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest & Doc, data) {
    if (!isDemo() || !this.demoUrl?.includes("/api/method/upload_file")) return send.call(this, data);
    const file = data instanceof FormData ? data.get("file") : null;
    if (!(file instanceof File)) return respond(this, 403, onBlocked("upload_file"));
    upload(file, data as FormData).then((doc) => respond(this, 200, { message: doc }));
  };
}

async function upload(file: File, form: FormData) {
  await overlay.load();
  const name = randomName();
  const is_private = Number(form.get("is_private") ?? 0);
  await overlay.record("file", { name, file_name: file.name, file_size: file.size, is_private, blob: file });
  return overlay.projection.files.get(name);
}

function respond(xhr: XMLHttpRequest, status: number, body: unknown) {
  const text = JSON.stringify(body);
  Object.defineProperties(xhr, {
    readyState: { value: XMLHttpRequest.DONE },
    status: { value: status },
    responseText: { value: text },
    response: { value: text },
  });
  xhr.upload.dispatchEvent(new ProgressEvent("load"));
  for (const type of ["readystatechange", "load", "loadend"]) xhr.dispatchEvent(new ProgressEvent(type));
}
