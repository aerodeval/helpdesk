<template>
  <div class="mx-auto flex w-full max-w-2xl flex-col px-5 py-8">
    <TextInput
      v-model="query"
      size="md"
      variant="outline"
      type="text"
      placeholder="Search for an answer, e.g. refund not received"
      autofocus
    >
      <template #prefix>
        <FeatherIcon name="search" class="size-4 text-ink-gray-4" />
      </template>
    </TextInput>

    <!-- Results, with the ticket escape hatch as the last row. -->
    <div v-if="results.length" class="mt-4 flex flex-col">
      <button
        v-for="article in results"
        :key="article.name"
        type="button"
        class="flex items-start gap-3 border-b border-outline-gray-1 px-2 py-3 text-left transition-colors hover:bg-surface-gray-2"
        @click="openArticle(article.name)"
      >
        <KbArticleThumbnail class="mt-px" :src="imageOf(article.name)" />
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            class="truncate text-base font-medium text-ink-gray-8"
            v-html="highlight(article.title, query)"
          />
          <span
            class="line-clamp-1 text-p-sm text-ink-gray-6"
            v-html="highlight(snippet(article.name, query), query)"
          />
          <span class="truncate text-p-xs text-ink-gray-4">{{
            breadcrumb(article)
          }}</span>
        </span>
      </button>

      <button
        type="button"
        class="flex items-start gap-3 px-2 py-3 text-left transition-colors hover:bg-surface-gray-2"
        @click="createTicket"
      >
        <span
          class="mt-px flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-gray-2 text-ink-gray-6"
        >
          <FeatherIcon name="plus" class="size-4" />
        </span>
        <span class="flex min-w-0 flex-col gap-0.5">
          <span class="text-base font-medium text-ink-gray-8">
            Can’t find what you’re looking for?
          </span>
          <span class="text-p-sm text-ink-gray-6">
            Create a ticket and our team will get back to you.
          </span>
        </span>
      </button>
    </div>

    <!-- Nothing matched: this is the moment to offer a ticket. -->
    <div
      v-else-if="searched"
      class="mt-10 flex flex-col items-center gap-1 text-center"
    >
      <FeatherIcon name="search" class="size-6 text-ink-gray-4" />
      <span class="mt-2 text-base font-medium text-ink-gray-8">
        No articles found
      </span>
      <p class="max-w-xs text-p-sm text-ink-gray-6">
        We couldn’t find any matching articles. Create a ticket and our team
        will get back to you.
      </p>
      <Button
        class="mt-2"
        variant="subtle"
        iconLeft="plus"
        label="Create ticket"
        @click="createTicket"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
// Deflection step in front of the ticket form: search first, and only offer a
// ticket once the knowledge base comes up empty. Matching, snippets and
// highlighting are shared with the header search box via `articleSearch`.
import { Button, FeatherIcon, TextInput } from "frappe-ui";
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { MIN_QUERY, useArticleSearch } from "@app/components/articleSearch";
import KbArticleThumbnail from "@app/components/KbArticleThumbnail.vue";

const route = useRoute();
const router = useRouter();
const { matches, snippet, highlight, categoryOf, imageOf } = useArticleSearch();

// Arriving from the header search box: `?q=` seeds the field so the results are
// already on screen rather than making someone retype what they just typed.
const query = ref(String(route.query.q || ""));

const results = computed(() => matches(query.value));

// "Searched" means the query was long enough to run — below that the page shows
// neither results nor a no-results state.
const searched = computed(() => query.value.trim().length >= MIN_QUERY);

/** Where the article sits, so a result carries some context. */
function breadcrumb(article: { name: string }) {
  const category = categoryOf(article.name);
  return category ? `Knowledge base / ${category}` : "Knowledge base";
}

function openArticle(name: string) {
  router.push(`/articles/${name}`);
}

function createTicket() {
  const subject = query.value.trim();
  router.push({ path: "/new-ticket", query: subject ? { subject } : {} });
}
</script>
