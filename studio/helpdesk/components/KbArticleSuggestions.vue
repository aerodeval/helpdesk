<template>
  <div v-if="suggestions.length" class="rounded-xl bg-surface-gray-2 p-3">
    <div class="mb-1 flex items-center justify-between px-2 pt-1">
      <span class="text-base text-ink-gray-5">
        Suggested articles based on your subject
      </span>
      <button
        type="button"
        class="text-base text-ink-blue-link hover:underline"
        @click="seeAll"
      >
        See all
      </button>
    </div>
    <button
      v-for="(article, index) in suggestions"
      :key="article.name"
      type="button"
      class="flex w-full items-start gap-3 px-2 py-3 text-left"
      :class="
        index < suggestions.length - 1 && 'border-b border-outline-gray-1'
      "
      @click="openArticle(article.name)"
    >
      <div
        class="flex size-9 shrink-0 items-center justify-center rounded-md border border-outline-gray-2 bg-surface-white text-ink-gray-6"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" class="size-4">
          <path
            d="M11 1C12.6569 1 14 2.34315 14 4V12.5C14 13.8807 12.8807 15 11.5 15H4.5C3.11929 15 2 13.8807 2 12.5V3.5C2 2.11929 3.11929 1 4.5 1H11ZM4.5 2C3.67157 2 3 2.67157 3 3.5V12.5C3 13.3284 3.67157 14 4.5 14H11.5C12.3284 14 13 13.3284 13 12.5V4C13 2.89543 12.1046 2 11 2H4.5ZM10.75 10.5C11.0261 10.5 11.25 10.7239 11.25 11C11.25 11.2761 11.0261 11.5 10.75 11.5H5.25C4.97386 11.5 4.75 11.2761 4.75 11C4.75 10.7239 4.97386 10.5 5.25 10.5H10.75ZM10.75 7.5C11.0261 7.5 11.25 7.72386 11.25 8C11.25 8.27614 11.0261 8.5 10.75 8.5H5.25C4.97386 8.5 4.75 8.27614 4.75 8C4.75 7.72386 4.97386 7.5 5.25 7.5H10.75ZM10.75 4.5C11.0261 4.5 11.25 4.72386 11.25 5C11.25 5.27614 11.0261 5.5 10.75 5.5H5.25C4.97386 5.5 4.75 5.27614 4.75 5C4.75 4.72386 4.97386 4.5 5.25 4.5H10.75Z"
          />
        </svg>
      </div>
      <div class="min-w-0">
        <div class="truncate text-base font-medium text-ink-gray-8">
          {{ article.title }}
        </div>
        <div class="line-clamp-1 text-p-sm text-ink-gray-5">
          {{ snippet(article.name) }}
        </div>
      </div>
    </button>
  </div>
</template>

<script setup lang="ts">
// Suggested-articles card for the New ticket form. Takes the subject as `query`
// (bound to the page's subject variable) and matches published articles client-side
// (RediSearch is off on this bench). Self-contained so it can drop onto any Studio page.
import { computed } from "vue";
import { useRouter } from "vue-router";
import { createResource } from "frappe-ui";

const props = withDefaults(defineProps<{ query?: string }>(), { query: "" });
const router = useRouter();
const MIN_QUERY = 3;

// Guest-callable: a signed-out visitor raising a ticket is exactly who these
// suggestions are for, and `frappe.client.get_list` is closed to them.
const articles = createResource({
  url: "helpdesk.api.knowledge_base.get_public_articles",
  method: "GET",
  auto: true,
});

const contentByName = computed(() => {
  const map = new Map<string, string>();
  for (const article of articles.data || []) {
    map.set(
      article.name,
      (article.content || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    );
  }
  return map;
});

const suggestions = computed(() => {
  const needle = (props.query || "").trim().toLowerCase();
  if (needle.length < MIN_QUERY) return [];
  return (articles.data || [])
    .filter((article: any) =>
      `${article.title || ""} ${contentByName.value.get(article.name) || ""}`
        .toLowerCase()
        .includes(needle)
    )
    .slice(0, 3);
});

function snippet(name: string) {
  const text = contentByName.value.get(name) || "";
  const needle = (props.query || "").trim().toLowerCase();
  const index = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (index < 0) return text.slice(0, 120);
  const start = Math.max(0, index - 40);
  return (start > 0 ? "…" : "") + text.slice(start, start + 120);
}

function openArticle(name: string) {
  router.push(`/articles/${name}`);
}

function seeAll() {
  router.push("/");
}
</script>
