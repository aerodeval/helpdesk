<template>
  <Combobox
    class="w-full"
    trigger="input"
    variant="subtle"
    size="lg"
    :placeholder="placeholder"
    :options="options"
    :loading="articles.loading && !articles.data"
    :open="isOpen"
    :open-on-click="false"
    @update:open="(value) => (isOpen = value)"
    @update:query="onQuery"
  >
    <template #prefix>
      <FeatherIcon name="search" class="size-4 text-ink-gray-4" />
    </template>

    <!-- Replaces the default chevron so the trigger reads as a search box. -->
    <template #suffix><span /></template>

    <!-- One result row: article icon + title + a snippet windowed around the match. -->
    <template #item="{ item, query }">
      <div class="flex min-w-0 items-start gap-3">
        <div
          class="mt-px flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-gray-2 text-ink-gray-6"
        >
          <svg
            viewBox="0 0 16 16"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
            class="size-[18px]"
          >
            <path
              d="M11 1C12.6569 1 14 2.34315 14 4V12.5C14 13.8807 12.8807 15 11.5 15H4.5C3.11929 15 2 13.8807 2 12.5V3.5C2 2.11929 3.11929 1 4.5 1H11ZM4.5 2C3.67157 2 3 2.67157 3 3.5V12.5C3 13.3284 3.67157 14 4.5 14H11.5C12.3284 14 13 13.3284 13 12.5V4C13 2.89543 12.1046 2 11 2H4.5ZM10.75 10.5C11.0261 10.5 11.25 10.7239 11.25 11C11.25 11.2761 11.0261 11.5 10.75 11.5H5.25C4.97386 11.5 4.75 11.2761 4.75 11C4.75 10.7239 4.97386 10.5 5.25 10.5H10.75ZM10.75 7.5C11.0261 7.5 11.25 7.72386 11.25 8C11.25 8.27614 11.0261 8.5 10.75 8.5H5.25C4.97386 8.5 4.75 8.27614 4.75 8C4.75 7.72386 4.97386 7.5 5.25 7.5H10.75ZM10.75 4.5C11.0261 4.5 11.25 4.72386 11.25 5C11.25 5.27614 11.0261 5.5 10.75 5.5H5.25C4.97386 5.5 4.75 5.27614 4.75 5C4.75 4.72386 4.97386 4.5 5.25 4.5H10.75Z"
            />
          </svg>
        </div>
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <div class="flex min-w-0 items-baseline gap-2">
            <span
              class="min-w-0 flex-1 truncate text-base text-ink-gray-8"
              v-html="highlight(item.label, query)"
            />
            <span
              v-if="categoryOf(item.key)"
              class="shrink-0 text-p-xs text-ink-gray-4"
              >{{ categoryOf(item.key) }}</span
            >
          </div>
          <span
            class="line-clamp-1 text-p-sm text-ink-gray-5"
            v-html="highlight(snippet(item.key, query), query)"
          />
        </div>
      </div>
    </template>

    <template #empty="{ query }">
      <div
        class="flex flex-col items-center justify-center gap-2 py-8 text-center"
      >
        <FeatherIcon name="search" class="size-8 text-ink-gray-3" />
        <p class="text-base text-ink-gray-6">
          {{
            query.trim().length < MIN_QUERY
              ? "Keep typing to search…"
              : "No answers found"
          }}
        </p>
      </div>
    </template>
  </Combobox>
</template>

<script setup lang="ts">
// KB article search for the public Knowledge Base Studio page. Built on
// frappe-ui's Combobox so keyboard navigation (↑/↓/Enter/Esc) comes for free.
// Each article is a `custom` option: its `condition` drives visibility (our own
// title + body search, since Combobox's built-in filter only matches label) and
// its `onClick` opens the article; the #item slot renders the title + snippet.
// RediSearch isn't available on this bench, so we fetch the published articles
// once and match client-side (small corpus).
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { Combobox, FeatherIcon, createResource } from "frappe-ui";

withDefaults(defineProps<{ placeholder?: string }>(), {
  placeholder: "Search articles (e.g. billing, integration, or general)",
});

const router = useRouter();
const MIN_QUERY = 3;
const SNIPPET_LENGTH = 140;
const SNIPPET_LEAD = 40;

// The results panel is query-driven: clicking into an empty box used to open a
// tall empty panel saying "Keep typing to search…".
const isOpen = ref(false);

function onQuery(value: string) {
  isOpen.value = value.trim().length > 0;
}

const articles = createResource({
  url: "frappe.client.get_list",
  params: {
    doctype: "HD Article",
    filters: { status: "Published" },
    fields: ["name", "title", "content", "category"],
    limit_page_length: 0,
  },
  auto: true,
});

const categories = createResource({
  url: "frappe.client.get_list",
  params: {
    doctype: "HD Article Category",
    fields: ["name", "category_name"],
    limit_page_length: 0,
  },
  auto: true,
});

const categoryByArticle = computed(() => {
  const labels = new Map<string, string>();
  for (const category of categories.data || [])
    labels.set(category.name, category.category_name || category.name);

  const map = new Map<string, string>();
  for (const article of articles.data || [])
    map.set(article.name, labels.get(article.category) || "");
  return map;
});

// name -> plain-text content, reused for both matching and snippet building.
const contentByName = computed(() => {
  const map = new Map<string, string>();
  for (const article of articles.data || []) {
    const text = (article.content || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    map.set(article.name, text);
  }
  return map;
});

const options = computed(() =>
  (articles.data || []).map((article: any) => {
    const haystack = `${article.title || ""} ${
      contentByName.value.get(article.name) || ""
    }`.toLowerCase();
    return {
      type: "custom",
      key: article.name,
      label: article.title,
      condition: ({ query }: { query: string }) => {
        const needle = query.trim().toLowerCase();
        return needle.length >= MIN_QUERY && haystack.includes(needle);
      },
      onClick: () => router.push(`/articles/${article.name}`),
    };
  })
);

function snippet(name: string, query: string) {
  const text = contentByName.value.get(name) || "";
  const needle = query.trim().toLowerCase();
  const index = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (index < 0) return text.slice(0, SNIPPET_LENGTH);

  // Snap the window to word boundaries — slicing on a raw offset left results
  // reading "…s article covers", which looks like a rendering bug.
  const start = wordStart(text, Math.max(0, index - SNIPPET_LEAD));
  const end = wordEnd(text, Math.min(text.length, start + SNIPPET_LENGTH));
  return (
    (start > 0 ? "… " : "") +
    text.slice(start, end).trim() +
    (end < text.length ? " …" : "")
  );
}

function wordStart(text: string, from: number) {
  if (from === 0) return 0;
  const next = text.indexOf(" ", from);
  return next === -1 ? from : next + 1;
}

function wordEnd(text: string, to: number) {
  if (to >= text.length) return text.length;
  const previous = text.lastIndexOf(" ", to);
  return previous === -1 ? to : previous;
}

/** Wrap every occurrence of the query so the match is visible at a glance.
 *  Escapes first: titles and article bodies are author-supplied HTML. */
function highlight(text: string, query: string) {
  const escaped = escapeHtml(text || "");
  const needle = query.trim();
  if (needle.length < MIN_QUERY) return escaped;
  const pattern = new RegExp(escapeRegExp(escapeHtml(needle)), "gi");
  return escaped.replace(
    pattern,
    (match) =>
      `<mark class="bg-surface-amber-2 text-ink-gray-9 rounded-sm">${match}</mark>`
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function categoryOf(name: string) {
  return categoryByArticle.value.get(name) || "";
}
</script>

<style>
/* Pin the results dropdown to the search input's width. reka exposes the
   trigger width as a CSS var on the content element; without this the long
   snippets stretch the panel wider than the input. Unscoped on purpose — the
   popover is portaled to <body>, outside this component's DOM subtree. */
[data-slot="content"][data-variant="subtle"][data-size="lg"] {
  width: var(--reka-combobox-trigger-width);
}
/* Flat, generously padded rows with hairline dividers, matching the KB design. */
[data-slot="content"][data-variant="subtle"][data-size="lg"]
  [data-slot="item"] {
  border-radius: 0;
  padding-top: 0.75rem;
  padding-bottom: 0.75rem;
}
[data-slot="content"][data-variant="subtle"][data-size="lg"]
  [data-slot="item"]:not(:last-child) {
  border-bottom: 1px solid var(--outline-gray-1, #ededed);
}
</style>
