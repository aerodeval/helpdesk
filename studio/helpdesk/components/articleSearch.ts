// Shared article search for the KB portal: the header's Combobox and the help
// page's inline results both read from here, so matching, snippets and highlighting
// cannot drift apart. RediSearch is not available on this bench, so the published
// articles are fetched once (module scope — one fetch for the whole app) and matched
// client-side; the corpus is small.
import { createResource } from "frappe-ui";
import { computed } from "vue";

export const MIN_QUERY = 3;

const SNIPPET_LENGTH = 140;
const SNIPPET_LEAD = 40;

// Through the helpdesk's own endpoints, not `frappe.client.get_list`: that one is
// closed to guests, so searching the public knowledge base failed for exactly the
// people it is published for.
const articles = createResource({
  url: "helpdesk.api.knowledge_base.get_public_articles",
  method: "GET",
  auto: true,
});

const categories = createResource({
  url: "helpdesk.api.knowledge_base.get_public_categories",
  method: "GET",
  auto: true,
});

/** name -> plain-text body, reused for matching and for building snippets. */
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

/** HD Article has no cover field, so the first image in the body is the article's
 *  overview image — the same one a reader sees at the top of the page. */
const imageByArticle = computed(() => {
  const map = new Map<string, string>();
  for (const article of articles.data || []) {
    const match = /<img[^>]+src="([^"]+)"/i.exec(article.content || "");
    if (match) map.set(article.name, match[1]);
  }
  return map;
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

export function useArticleSearch() {
  return {
    articles,
    loading: computed(() => articles.loading && !articles.data),
    matches,
    snippet,
    highlight,
    categoryOf,
    imageOf,
  };
}

/** Title or body match. Below MIN_QUERY nothing matches, so a stray keypress
 *  does not dump the whole knowledge base on screen. */
function matches(query: string) {
  const needle = query.trim().toLowerCase();
  if (needle.length < MIN_QUERY) return [];
  return (articles.data || []).filter((article: any) => {
    const haystack = `${article.title || ""} ${
      contentByName.value.get(article.name) || ""
    }`.toLowerCase();
    return haystack.includes(needle);
  });
}

/** A window of body text around the match, snapped to word boundaries — slicing
 *  on the raw offset left results reading "…s article covers". */
function snippet(name: string, query: string) {
  const text = contentByName.value.get(name) || "";
  const needle = query.trim().toLowerCase();
  const index = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (index < 0) return text.slice(0, SNIPPET_LENGTH);

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

/** Wrap each occurrence of the query so the match is visible at a glance.
 *  Escapes first: titles and bodies are author-supplied and this is used with v-html. */
function highlight(text: string, query: string) {
  const escaped = escapeHtml(text || "");
  const needle = query.trim();
  if (needle.length < MIN_QUERY) return escaped;
  const pattern = new RegExp(escapeRegExp(escapeHtml(needle)), "gi");
  // Styled in KbSearch.vue: weight and ink rather than a highlighter pill, which
  // was the one splash of colour in an otherwise greyscale portal.
  return escaped.replace(pattern, (match) => `<mark class="kb-mark">${match}</mark>`);
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

function imageOf(name: string) {
  return imageByArticle.value.get(name) || "";
}
