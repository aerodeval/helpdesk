<template>
  <Combobox
    class="w-full"
    trigger="input"
    variant="subtle"
    size="lg"
    :placeholder="placeholder"
    :options="options"
    :loading="loading"
    :open="isOpen"
    :open-on-click="false"
    @update:open="(value) => (isOpen = value)"
    @update:query="onQuery"
  >
    <template #prefix>
      <!-- Nudged so this icon shares a vertical axis with the centre of a result
           row's 36px thumbnail; the trigger's own px-3 lands it 9px short. -->
      <FeatherIcon name="search" class="ml-[9px] size-4 text-ink-gray-4" />
    </template>

    <!-- Replaces the default chevron so the trigger reads as a search box. -->
    <template #suffix><span /></template>

    <!-- One result row: the article's overview image (or a glyph) + title + a
         snippet windowed around the match. The last row is the "see everything"
         escape to the help page. -->
    <template #item="{ item, query }">
      <div
        v-if="item.key === SEARCH_ALL"
        class="flex min-w-0 items-center gap-3"
      >
        <div
          class="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-gray-2 text-ink-gray-6"
        >
          <FeatherIcon name="search" class="size-4" />
        </div>
        <span class="min-w-0 truncate text-base text-ink-gray-8">
          Search for “{{ query.trim() }}”
        </span>
      </div>
      <div v-else class="flex min-w-0 items-start gap-3">
        <KbArticleThumbnail class="mt-px" :src="imageOf(item.key)" />
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            class="min-w-0 truncate text-base text-ink-gray-8"
            v-html="highlight(item.label, query)"
          />
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
// KB article search for the public Knowledge Base Studio page. Built on frappe-ui's
// Combobox so keyboard navigation (↑/↓/Enter/Esc) comes for free. Each article is a
// `custom` option: its `condition` drives visibility (our own title + body search,
// since Combobox's built-in filter only matches label) and its `onClick` opens the
// article; the #item slot renders the title + snippet. Matching, snippets and
// highlighting are shared with the help page via `articleSearch`.
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { Combobox, FeatherIcon } from "frappe-ui";
import { MIN_QUERY, useArticleSearch } from "@app/components/articleSearch";
import KbArticleThumbnail from "@app/components/KbArticleThumbnail.vue";

withDefaults(defineProps<{ placeholder?: string }>(), {
  placeholder: "Search articles (e.g. billing, integration, or general)",
});

const router = useRouter();
const { articles, loading, matches, snippet, highlight, imageOf } =
  useArticleSearch();

// The results panel is query-driven: clicking into an empty box used to open a
// tall empty panel saying "Keep typing to search…".
const isOpen = ref(false);

// Kept so the "Search for …" row can carry the query across to the help page —
// an option's onClick receives no query of its own.
const currentQuery = ref("");

function onQuery(value: string) {
  currentQuery.value = value;
  isOpen.value = value.trim().length > 0;
}

// Only the strongest few belong in a dropdown; the rest live on the help page.
const MAX_RESULTS = 5;
const SEARCH_ALL = "__search-all";

const options = computed(() => [
  ...(articles.data || []).map((article: any) => ({
    type: "custom",
    key: article.name,
    label: article.title,
    condition: ({ query }: { query: string }) =>
      matches(query)
        .slice(0, MAX_RESULTS)
        .some((match: any) => match.name === article.name),
    onClick: () => router.push(`/articles/${article.name}`),
  })),
  {
    type: "custom",
    key: SEARCH_ALL,
    label: "Search",
    // Offered as soon as there is a query, so a search that matched nothing here
    // still has somewhere to go.
    condition: ({ query }: { query: string }) => query.trim().length > 0,
    onClick: () =>
      router.push({ path: "/help", query: { q: currentQuery.value } }),
  },
]);
</script>

<style>
/* Pin the results dropdown to the search input's width. reka exposes the
   trigger width as a CSS var on the content element; without this the long
   snippets stretch the panel wider than the input. Unscoped on purpose — the
   popover is portaled to <body>, outside this component's DOM subtree. */
[data-slot="content"][data-variant="subtle"][data-size="lg"] {
  width: var(--reka-combobox-trigger-width);
}
/* Combobox caps its results list at max-h-60 (240px). The KB box shows at most
   five articles plus the "search for" row, so let it size to its content instead
   of scrolling a short list. Unscoped for the same reason as the rule above — the
   popover is portaled to <body>. */
[data-slot="content"][data-variant="subtle"][data-size="lg"]
  [data-slot="content-body"]
  > div {
  max-height: none;
}
/* Flat, generously padded rows with hairline dividers, matching the KB design.
   The horizontal padding lands a row's thumbnail on the same x as the search
   icon in the input above it. */
[data-slot="content"][data-variant="subtle"][data-size="lg"]
  [data-slot="item"] {
  border-radius: 0;
  padding: 0.75rem 0.5rem;
}
[data-slot="content"][data-variant="subtle"][data-size="lg"]
  [data-slot="item"]:not(:last-child) {
  border-bottom: 1px solid var(--outline-gray-1, #ededed);
}
</style>
