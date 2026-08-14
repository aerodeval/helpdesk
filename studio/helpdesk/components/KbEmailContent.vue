<template>
  <iframe ref="frame" :srcdoc="srcdoc" class="kb-email" />
</template>

<script setup lang="ts">
// Email bodies, rendered the way `desk/src/components/EmailContent.vue` renders
// them: inside an iframe. The iframe is not decoration — it is what keeps a mail's
// own markup and styles from reaching the portal around it, and it is why the desk
// can show the HTML as sent rather than as some editor re-parsed it.
//
// The desk links its built stylesheet into the frame; this app has no such bundle,
// so the handful of rules that matter are inlined below — same 14/21 type, same 8px
// paragraph rhythm, same collapsed quoted replies.
import { computed, ref, watch } from "vue";

const props = withDefaults(defineProps<{ content?: string }>(), {
  content: "",
});

const frame = ref<HTMLIFrameElement | null>(null);

/** Gmail, Outlook and helpdesk's own reply markers, in that order. */
const QUOTE_SELECTORS = [
  "div.gmail_quote",
  "div#appendonsend",
  "p.reply-to-content",
];

const body = computed(() => collapseQuotes(props.content || ""));

// Everything below the first quote marker is folded behind a "..." toggle, so a long
// chain does not bury the message that was actually written.
function collapseQuotes(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const selector = QUOTE_SELECTORS.find((s) => doc.querySelector(s));
  if (!selector) return html;

  let quote = nextQuote(doc, selector);
  while (quote) {
    fold(doc, quote);
    quote = nextQuote(doc, selector);
  }
  return doc.body.innerHTML;
}

// Folding keeps the quote's own markup, so the marker that matched is still in the
// document afterwards — searching for it again without skipping what is already
// folded finds the copy and folds forever.
function nextQuote(doc: Document, selector: string) {
  return doc.querySelector(`${selector}:not(.replied-content *)`);
}

function fold(doc: Document, quote: Element) {
  const id = `quote-${Math.abs(hash(quote.innerHTML))}`;
  const wrapper = doc.createElement("div");
  wrapper.className = "replied-content";

  const label = doc.createElement("label");
  label.className = "collapse";
  label.setAttribute("for", id);
  label.innerHTML = "...";

  const toggle = doc.createElement("input");
  toggle.id = id;
  toggle.type = "checkbox";

  const hidden = doc.createElement("div");
  hidden.appendChild(quote.cloneNode(true));

  // Whatever follows the quote is part of it, so it folds away too.
  let sibling = quote.nextSibling;
  while (sibling) {
    const next = sibling.nextSibling;
    hidden.appendChild(sibling);
    sibling = next;
  }

  wrapper.append(label, toggle, hidden);
  quote.parentElement?.replaceChild(wrapper, quote);
}

/** Stable id per quote, so toggling one does not re-render as a different node. */
function hash(value: string) {
  let result = 0;
  for (let i = 0; i < value.length; i++) {
    result = (result << 5) - result + value.charCodeAt(i);
    result |= 0;
  }
  return result;
}

const srcdoc = computed(
  () => `<!DOCTYPE html><html><head><base target="_blank" /><style>
    body { margin: 0; }
    .email-content {
      font-family: InterVar, ui-sans-serif, system-ui, sans-serif;
      font-size: 14px;
      line-height: 21px;
      color: #383838;
      word-break: break-word;
    }
    .email-content p { margin: 8px 0; }
    .email-content img { margin: 0; border-width: 0; max-width: 100%; }
    .email-content blockquote {
      margin: 8px 0;
      padding-left: 12px;
      border-left: 2px solid #e2e2e2;
      color: #6b6b6b;
    }
    .email-content blockquote p:first-of-type::before,
    .email-content blockquote p:last-of-type::after { content: none; }
    .email-content a { color: #2376f1; }
    .email-content table { border-collapse: collapse; }
    .replied-content .collapse {
      margin: 10px 0;
      cursor: pointer;
      display: flex;
      font-size: larger;
      font-weight: 700;
      height: 12px;
      line-height: 0.1;
      color: #383838;
      background: #e8eaed;
      width: 23px;
      justify-content: center;
      border-radius: 5px;
    }
    .replied-content .collapse:hover { background: #dadce0; }
    .replied-content .collapse + input { display: none; }
    .replied-content .collapse + input + div { display: none; }
    .replied-content .collapse + input:checked + div { display: block; }
  </style></head><body><div class="email-content">${body.value}</div></body></html>`
);

// The frame has no layout of its own, so its height is set from its content — and
// set again when a quote is unfolded.
watch(
  frame,
  (element) => {
    if (!element) return;
    element.onload = () => resize(element);
  },
  { immediate: true }
);

watch(
  srcdoc,
  () => frame.value && requestAnimationFrame(() => resize(frame.value!))
);

function resize(element: HTMLIFrameElement) {
  const root = element.contentDocument?.documentElement;
  if (!root) return;
  element.style.height = `${root.offsetHeight + 1}px`;
  element.contentDocument
    ?.querySelectorAll('input[type="checkbox"]')
    .forEach((toggle) =>
      toggle.addEventListener("change", () => {
        element.style.height = `${root.offsetHeight + 1}px`;
      })
    );
}
</script>

<style scoped>
.kb-email {
  display: block;
  width: 100%;
  height: 40px;
  max-height: 500px;
  border: 0;
}
</style>
