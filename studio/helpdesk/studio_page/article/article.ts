import { computed, ref, watch } from 'vue'
import { useSettingsModal } from '@app/stores/settings'

export default function setup(context) {
  // `article` is read through `?.` throughout: Studio only creates a Document
  // resource once its name resolves, so with no :name in the route (the builder
  // canvas) it is absent, and a bare `article.data` would throw and take the
  // whole script — sidebar, TOC, everything — down with it.
  const { categories, articles, article, articleSearch, route, router, call, toast } = context

  // Format a date string as "14 Jan 2025" (day + short month + year)
  function formatDate(value) {
    if (!value) return ''
    const d = new Date(value)
    if (isNaN(d.getTime())) return value
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  // Build the "On this page" TOC from the article's headings, and inject ids
  // into those headings so clicking a TOC entry can scroll to them.
  const parsed = computed(() => {
    const html = article?.data?.content || ''
    const dom = new DOMParser().parseFromString(html, 'text/html')
    const headings = Array.from(dom.querySelectorAll('h1, h2, h3'))
    const toc = headings.map((h, i) => {
      const id = 'section-' + i
      h.setAttribute('id', id)
      return { id, text: (h.textContent || '').trim(), level: Number(h.tagName[1]) }
    })
    const words = (dom.body.textContent || '').trim().split(/\s+/).filter(Boolean).length
    return { html: dom.body.innerHTML, toc, words }
  })
  const articleHtml = computed(() => parsed.value.html)
  const toc = computed(() => parsed.value.toc)

  // 200 words per minute, the usual assumption for prose; never below a minute.
  const readingTime = computed(() => {
    const minutes = Math.max(1, Math.round(parsed.value.words / 200))
    return minutes + (minutes === 1 ? ' minute to read' : ' minutes to read')
  })

  // LHS navigation tree: one collapsible section per category, one item per
  // article. `icon` is the category's own feather icon name; `isCurrent` marks
  // the category holding the article being read, which is the row the design
  // elevates. Navigation is a plain router.push from the item's click event.
  const searchQuery = computed(() => (articleSearch?.value || '').trim().toLowerCase())

  const categoryTrees = computed(() => {
    const current = route.params.name
    const arts = articles.data || []

    return (categories.data || [])
      .map(cat => {
        const label = cat.category_name || cat.name
        // A category name match keeps all of its articles listed.
        const wholeCategoryMatches = label.toLowerCase().includes(searchQuery.value)
        const children = arts
          .filter(a => a.category === cat.name)
          .filter(a => wholeCategoryMatches || a.title.toLowerCase().includes(searchQuery.value))
          .map(a => ({ name: a.name, label: a.title, isActive: a.name === current }))
        return {
          name: cat.name,
          label,
          icon: cat.icon,
          children,
          isCurrent: children.some(child => child.isActive),
        }
      })
      .filter(cat => !searchQuery.value || cat.children.length)
  })

  // The Document resource carries only the author's user id ("Administrator"), so
  // the byline showed that and an empty avatar. The KB API resolves it to a display
  // name and picture, and is guest-readable like the page itself.
  const author = ref({ name: '', image: '' })
  watch(
    () => article?.data?.name,
    async (name) => {
      if (!name) return
      try {
        const data = await call('helpdesk.api.knowledge_base.get_article', { name })
        if (data?.author) author.value = data.author
      } catch (error) {
        // Leave it empty; the byline falls back to the raw author id.
      }
    },
    { immediate: true },
  )

  // Middle crumb for the header: the article's category, resolved to its display
  // name because `article.data.category` only holds the docname.
  const currentCategory = computed(() => {
    const name = article?.data?.category
    if (!name) return null
    const category = (categories.data || []).find(c => c.name === name)
    return { label: category?.category_name || name, route: '/category/' + name }
  })

  // Other published articles in the same category (for "Related articles").
  const relatedArticles = computed(() => {
    const current = article?.data
    if (!current) return []
    return (articles.data || [])
      .filter(a => a.category === current.category && a.name !== current.name)
      .slice(0, 6)
  })

  // Feedback: `get_public_article` already answers with the reader's own vote, so
  // showing it needs no second call and no guess about who is reading.
  const selectedFeedback = ref(null)   // '1' like / '2' dislike
  watch(
    () => article?.data?.feedback,
    (vote) => (selectedFeedback.value = vote && vote !== '0' ? vote : null),
    { immediate: true },
  )

  // One endpoint for both readers: it resolves a signed-in user itself, and hands a
  // signed-out one the cookie that keeps their vote apart from every other guest's.
  async function submitFeedback(value) {
    const articleName = article?.data?.name
    if (!articleName) return
    const previous = selectedFeedback.value
    selectedFeedback.value = value
    try {
      await call('helpdesk.api.knowledge_base.vote_on_article', {
        article: articleName,
        value,
      })
      toast.success('Thanks for your feedback!')
    } catch (e) {
      selectedFeedback.value = previous
      toast.error(e?.messages?.[0] || 'Could not submit feedback')
    }
  }

  // Per-category expand/collapse. Collapsed by default, except the category that
  // holds the article being read. A user toggle overrides that default.
  const expandedOverrides = ref({})
  function defaultExpanded(name) {
    return categoryTrees.value.find(cat => cat.name === name)?.isCurrent || false
  }
  function isExpanded(name) {
    // While searching, every surviving category is open so no hit stays buried.
    if (searchQuery.value) return true
    return name in expandedOverrides.value ? expandedOverrides.value[name] : defaultExpanded(name)
  }
  function toggleCategory(name) {
    expandedOverrides.value = { ...expandedOverrides.value, [name]: !isExpanded(name) }
  }

  const navMenuOpen = ref(false)

  return {
    ...useSettingsModal(context),
    formatDate,
    categoryTrees, toggleCategory, isExpanded, articleHtml, toc, readingTime, author, currentCategory, relatedArticles,
    selectedFeedback, submitFeedback,
    navMenuOpen,
  }
}
