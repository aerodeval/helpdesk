<template>
  <nav v-if="headings.length" class="kb-toc">
    <button
      v-for="heading in headings"
      :key="heading.id"
      type="button"
      class="kb-toc__item"
      :class="{ 'kb-toc__item--active': heading.id === activeId }"
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{ items?: { id: string; text: string }[] }>();

// A heading becomes current once it crosses this far down the scrolling box.
// A fraction rather than a fixed offset because a short article can fit every
// section on one screen — against a fixed 100px line only the first heading
// would ever qualify, and the rail would sit on it for the whole article.
const ACTIVE_RATIO = 0.25;

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
  const list = headings.value;
  if (!list.length) return null;

  const box = target instanceof HTMLElement ? target : null;
  // The last section is usually too short to reach the line, so at the end of
  // the scroll it would never light up — hand it the rail outright.
  if (box && box.scrollTop + box.clientHeight >= box.scrollHeight - 4) {
    return list[list.length - 1].id;
  }

  const rect = box?.getBoundingClientRect();
  const line =
    (rect?.top ?? 0) + (rect?.height ?? window.innerHeight) * ACTIVE_RATIO;

  let current = list[0].id;
  for (const heading of list) {
    const element = document.getElementById(heading.id);
    if (element && element.getBoundingClientRect().top <= line)
      current = heading.id;
  }
  return current;
});

function onScroll() {
  scrollTick.value += 1;
}

// The article body scrolls inside a nested container, and a scroll there never
// reaches a listener on `window` — not even in the capture phase. So find the
// element that actually scrolls and listen on that.
function scrollParent(element: HTMLElement): HTMLElement | Window {
  let node = element.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (
      /(auto|scroll|overlay)/.test(overflowY) &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return window;
}

let target: HTMLElement | Window | null = null;
let observer: IntersectionObserver | null = null;

function detach() {
  target?.removeEventListener("scroll", onScroll);
  target = null;
  observer?.disconnect();
  observer = null;
}

function listen(attempt = 0) {
  const first = document.getElementById(headings.value[0]?.id);
  // The headings are written into the HTML block after this mounts, so the
  // container can't be resolved yet on the first pass — wait for them rather
  // than falling back to `window`, which never sees this container's scroll.
  if (!first) {
    if (attempt < 60) requestAnimationFrame(() => listen(attempt + 1));
    return;
  }

  detach();
  target = scrollParent(first);
  target.addEventListener("scroll", onScroll, { passive: true });

  // Belt and braces: the observer fires on the crossing itself, so the rail
  // still updates if a scroll event is ever missed on this nested container.
  observer = new IntersectionObserver(onScroll, {
    root: target instanceof Window ? null : target,
    rootMargin: `-${ACTIVE_RATIO * 100}% 0px -${(1 - ACTIVE_RATIO) * 100}% 0px`,
    threshold: 0,
  });
  for (const heading of headings.value) {
    const element = document.getElementById(heading.id);
    if (element) observer.observe(element);
  }
  onScroll();
}

// The headings are injected into a sibling HTML block, so they can land after
// this mounts; rebind whenever the list changes.
watch(headings, () => listen(), { flush: "post" });

function scrollToHeading(id: string) {
  // Deliberately instant. The article body lives in a nested scroll container
  // whose ancestor chain includes an overflow-y:hidden box, and Chrome silently
  // drops *every* smooth scroll on that chain (scrollIntoView, scrollTo, and
  // CSS scroll-behavior alike) — asking for smooth here makes the click a no-op.
  document.getElementById(id)?.scrollIntoView({ block: "start" });
}

onMounted(() => listen());

onBeforeUnmount(detach);
</script>

<style scoped>
/* Plain CSS rather than utilities: this app sits outside the bench's Tailwind
   content globs, so classes nothing else uses — `py-[7px]`, the arbitrary
   `border-l-[color:…]` pair — never compile, and the rail loses both its
   padding and the contrast that marks the current section. */
.kb-toc {
  display: flex;
  flex-direction: column;
}

.kb-toc__item {
  border-left: 1px solid var(--outline-gray-1);
  padding: 7px 0 7px 12px;
  text-align: left;
  font-size: 14px;
  line-height: 1.5;
  letter-spacing: 0.28px;
  color: var(--ink-gray-5);
  cursor: pointer;
  transition: color 150ms ease, border-color 150ms ease;
}

.kb-toc__item:hover {
  border-left-color: var(--outline-gray-3);
  color: var(--ink-gray-7);
}

.kb-toc__item--active {
  border-left-color: var(--ink-gray-9);
  color: var(--ink-gray-9);
}
</style>

<style>
/* The headings belong to the article's HTML block, outside this component's
   subtree, so this rule is unscoped on purpose — scoped styles would never
   reach them. Keeps a smooth-scrolled heading off the viewport's top edge. */
[id^="section-"] {
  scroll-margin-top: 16px;
}
</style>
