<template>
  <Popover class="w-full" :match-trigger-width="true">
    <!-- Search input: opens the results popover once the query is meaningful -->
    <template #target="{ open, close }">
      <FormControl
        class="w-full"
        type="text"
        size="lg"
        variant="subtle"
        :placeholder="placeholder"
        v-model="query"
        @update:model-value="(value) => (value.length >= 3 ? open() : close())"
      >
        <template #prefix>
          <FeatherIcon name="search" class="size-4 text-ink-gray-4" />
        </template>
      </FormControl>
    </template>

    <!-- Results dropdown -->
    <template #body-main="{ close }">
      <div
        class="max-h-[420px] overflow-auto p-2"
        :style="{ width: 'var(--reka-popover-trigger-width)' }"
      >
        <template v-if="results.length">
          <button
            v-for="article in results"
            :key="article.name"
            class="flex w-full flex-col gap-1 rounded-md p-2 text-left hover:bg-surface-gray-2"
            @click="openArticle(article, close)"
          >
            <span class="block w-full truncate text-base text-ink-gray-8">{{
              article.title
            }}</span>
            <span class="line-clamp-1 w-full text-p-sm text-ink-gray-5">{{
              article.snippet
            }}</span>
          </button>
        </template>

        <div
          v-else-if="loading"
          class="flex h-[200px] flex-col items-center justify-center gap-2"
        >
          <FeatherIcon name="search" class="size-8 text-ink-gray-3" />
          <p class="text-base text-ink-gray-6">Searching…</p>
        </div>

        <div
          v-else
          class="flex h-[200px] flex-col items-center justify-center gap-2"
        >
          <FeatherIcon name="search" class="size-8 text-ink-gray-3" />
          <p class="text-base text-ink-gray-6">No answers found</p>
          <span class="text-center text-p-sm text-ink-gray-5">
            Rephrase and try again with some keywords
          </span>
        </div>
      </div>
    </template>
  </Popover>
</template>

<script setup lang="ts">
// KB article search for the public Knowledge Base Studio page. Mirrors the
// desk KB search UX (SearchPopover + SearchArticles) — a results dropdown that
// opens once the query is meaningful. RediSearch isn't available on this bench,
// so instead of helpdesk.api.article.search we filter the published articles
// client-side (small corpus). Results route to /articles/<name>, matching the
// article-card navigation used elsewhere on the page.
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { Popover, FormControl, FeatherIcon, createResource } from "frappe-ui";

withDefaults(defineProps<{ placeholder?: string }>(), {
  placeholder: "Search articles (e.g. billing, integration, or general)",
});

const router = useRouter();
const query = ref("");
const MAX_RESULTS = 7;

const articles = createResource({
  url: "frappe.client.get_list",
  params: {
    doctype: "HD Article",
    filters: { status: "Published" },
    fields: ["name", "title", "content"],
    limit_page_length: 0,
  },
  auto: true,
});
const loading = computed(() => articles.loading);

function snippet(content: string, needle: string) {
  const text = (content || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const index = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (index < 0) return text.slice(0, 140);
  const start = Math.max(0, index - 40);
  return (start > 0 ? "…" : "") + text.slice(start, start + 140);
}

const results = computed(() => {
  const needle = query.value.trim().toLowerCase();
  if (needle.length < 3 || !articles.data) return [];
  return articles.data
    .filter(
      (article: any) =>
        (article.title || "").toLowerCase().includes(needle) ||
        (article.content || "").toLowerCase().includes(needle)
    )
    .slice(0, MAX_RESULTS)
    .map((article: any) => ({
      name: article.name,
      title: article.title,
      snippet: snippet(article.content, needle),
    }));
});

function openArticle(article: { name: string }, close: () => void) {
  close();
  router.push({ path: `/articles/${article.name}` });
}
</script>
