import { computed, ref, watch } from 'vue'
import { useSettingsModal } from '@app/stores/settings'

export default function setup(context) {
  // `article` is read through `?.` throughout: Studio only creates a Document
  // resource once its name resolves, so with no :name in the route (the builder
  // canvas) it is absent, and a bare `article.doc` would throw and take the
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
    const html = article?.doc?.content || ''
    const dom = new DOMParser().parseFromString(html, 'text/html')
    const headings = Array.from(dom.querySelectorAll('h1, h2, h3'))
    const toc = headings.map((h, i) => {
      const id = 'section-' + i
      h.setAttribute('id', id)
      return { id, text: (h.textContent || '').trim(), level: Number(h.tagName[1]) }
    })
    return { html: dom.body.innerHTML, toc }
  })
  const articleHtml = computed(() => parsed.value.html)
  const toc = computed(() => parsed.value.toc)

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
    () => article?.doc?.name,
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
  // name because `article.doc.category` only holds the docname.
  const currentCategory = computed(() => {
    const name = article?.doc?.category
    if (!name) return null
    const category = (categories.data || []).find(c => c.name === name)
    return { label: category?.category_name || name, route: '/category/' + name }
  })

  // Other published articles in the same category (for "Related articles").
  const relatedArticles = computed(() => {
    const current = article?.doc
    if (!current) return []
    return (articles.data || [])
      .filter(a => a.category === current.category && a.name !== current.name)
      .slice(0, 6)
  })

  // Feedback: reflect the current user's saved rating on load, upsert on click.
  const selectedFeedback = ref(null)   // '1' like / '2' dislike
  const feedbackName = ref(null)       // existing HD Article Feedback doc name
  const currentUser = ref(null)

  async function loadFeedback(articleName) {
    selectedFeedback.value = null
    feedbackName.value = null
    if (!articleName) return
    try {
      currentUser.value = await call('frappe.auth.get_logged_user')
      const rows = await call('frappe.client.get_list', {
        doctype: 'HD Article Feedback',
        filters: { article: articleName, user: currentUser.value },
        fields: ['name', 'feedback'],
        limit_page_length: 1,
      })
      if (rows && rows.length) {
        selectedFeedback.value = rows[0].feedback
        feedbackName.value = rows[0].name
      }
    } catch (e) {
      // guest / not permitted — leave unselected
    }
  }
  watch(() => article?.doc?.name, loadFeedback, { immediate: true })

  async function submitFeedback(value) {
    const articleName = article?.doc?.name
    if (!articleName) return
    selectedFeedback.value = value
    try {
      const user = currentUser.value || (currentUser.value = await call('frappe.auth.get_logged_user'))
      if (feedbackName.value) {
        await call('frappe.client.set_value', {
          doctype: 'HD Article Feedback', name: feedbackName.value, fieldname: 'feedback', value,
        })
      } else {
        const doc = await call('frappe.client.insert', {
          doc: { doctype: 'HD Article Feedback', article: articleName, user, feedback: value },
        })
        feedbackName.value = doc.name
      }
      toast.success('Thanks for your feedback!')
    } catch (e) {
      toast.error('Could not submit feedback')
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
    categoryTrees, toggleCategory, isExpanded, articleHtml, toc, author, currentCategory, relatedArticles,
    selectedFeedback, submitFeedback,
    navMenuOpen,
  }
}
