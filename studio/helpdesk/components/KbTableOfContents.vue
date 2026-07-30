<template>
  <nav v-if="headings.length" class="flex flex-col">
    <button
      v-for="heading in headings"
      :key="heading.id"
      type="button"
      class="cursor-pointer border-l py-[7px] pl-3 text-left text-p-base transition-colors"
      :class="
        heading.id === activeId
          ? 'border-l-[color:var(--ink-gray-9)] text-ink-gray-9'
          : 'border-l-[color:var(--outline-gray-1)] text-ink-gray-5 hover:border-l-[color:var(--outline-gray-3)] hover:text-ink-gray-7'
      "
      @click="scrollToHeading(heading.id)"
    >
      {{ heading.text }}
    </button>
  </nav>
</template>

<script setup lang="ts">
// "On this page" rail for a KB article. The article body is rendered by a Studio
// HTML block, so its headings sit outside this component's subtree: `items`
// carries the ids that article.ts injected into them and we measure those
// elements straight off the document.
//
// Contiguous item boxes (padding, no flex gap) are deliberate — each item's left
// border joins the next into one unbroken rail, which is how the design draws a
// full-height track with a single dark segment against the active entry.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps<{ items?: { id: string; text: string }[] }>();

// Mirrors frappe-ui's editor TOC (useTocActiveHeading): a heading becomes
// current once its top has passed this far down the viewport.
const ACTIVE_OFFSET = 100;

const headings = computed(() =>
  Array.isArray(props.items) ? props.items : []
);

// Bumped on scroll purely to invalidate `activeId`. Measuring inside a lazy
// computed - rather than writing to a ref from a listener - means the active
// entry is derived fresh on every render, so it cannot go stale if the headings
// land in the DOM after this component mounts.
const scrollTick = ref(0);

const activeId = computed(() => {
  void scrollTick.value;
  let current = headings.value[0]?.id ?? null;
  for (const heading of headings.value) {
    const element = document.getElementById(heading.id);
    if (element && element.getBoundingClientRect().top <= ACTIVE_OFFSET) {
      current = heading.id;
    }
  }
  return current;
});

function onScroll() {
  scrollTick.value += 1;
}

function scrollToHeading(id: string) {
  // Deliberately instant. The article body lives in a nested scroll container
  // whose ancestor chain includes an overflow-y:hidden box, and Chrome silently
  // drops *every* smooth scroll on that chain (scrollIntoView, scrollTo, and
  // CSS scroll-behavior alike) — asking for smooth here makes the click a no-op.
  document.getElementById(id)?.scrollIntoView({ block: "start" });
}

// Capture phase so a scroll in any container is seen, not just the window's.
onMounted(() => {
  window.addEventListener("scroll", onScroll, { passive: true, capture: true });
});

onBeforeUnmount(() => {
  window.removeEventListener("scroll", onScroll, { capture: true });
});
</script>

<style>
/* The headings belong to the article's HTML block, outside this component's
   subtree, so this rule is unscoped on purpose — scoped styles would never
   reach them. Keeps a smooth-scrolled heading off the viewport's top edge. */
[id^="section-"] {
  scroll-margin-top: 16px;
}
</style>
