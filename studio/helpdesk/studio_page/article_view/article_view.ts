import { computed, ref, watch } from 'vue'
import { useSettingsModal } from '@app/stores/settings'

export default function setup(context) {
  const { categories, articles, article, route, router, call, toast } = context

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
    const html = article.doc?.content || ''
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
  // article. Each child carries isActive so the block can highlight the current
  // article; navigation is a plain router.push from the item's click event.
  const categoryTrees = computed(() => {
    const current = route.params.name
    const cats = categories.data || []
    const arts = articles.data || []

    return cats.map(cat => ({
      name: cat.name,
      label: cat.category_name || cat.name,
      children: arts
        .filter(a => a.category === cat.name)
        .map(a => ({
          name: a.name,
          label: a.title,
          isActive: a.name === current,
        }))
    }))
  })

  // Other published articles in the same category (for "Related articles").
  const relatedArticles = computed(() => {
    const current = article.doc
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
  watch(() => article.doc?.name, loadFeedback, { immediate: true })

  async function submitFeedback(value) {
    const articleName = article.doc?.name
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

  // New-ticket modal state + form fields.
  const ticketModalOpen = ref(false)
  const ticketSubject = ref('')
  const ticketType = ref('Question')
  const ticketDescription = ref('')
  const ticketMobile = ref('')
  const ticketPriority = ref('Low')

  async function createTicket() {
    if (!ticketSubject.value) {
      toast.error('Please enter a subject')
      return
    }
    try {
      await call('frappe.client.insert', {
        doc: {
          doctype: 'HD Ticket',
          subject: ticketSubject.value,
          ticket_type: ticketType.value,
          description: ticketDescription.value,
          priority: ticketPriority.value,
        },
      })
      toast.success('Ticket created!')
      ticketModalOpen.value = false
      ticketSubject.value = ''
      ticketDescription.value = ''
      ticketMobile.value = ''
    } catch (e) {
      toast.error('Could not create ticket')
    }
  }

  // Per-category expand/collapse. Collapsed by default, except the category that
  // holds the article being read. A user toggle overrides that default.
  const expandedOverrides = ref({})
  function defaultExpanded(name) {
    const cat = categoryTrees.value.find(c => c.name === name)
    return cat ? cat.children.some(child => child.isActive) : false
  }
  function isExpanded(name) {
    return name in expandedOverrides.value ? expandedOverrides.value[name] : defaultExpanded(name)
  }
  function toggleCategory(name) {
    expandedOverrides.value = { ...expandedOverrides.value, [name]: !isExpanded(name) }
  }

  const navMenuOpen = ref(false)

  return {
    ...useSettingsModal(),
    formatDate,
    categoryTrees, toggleCategory, isExpanded, articleHtml, toc, relatedArticles, selectedFeedback, submitFeedback,
    ticketModalOpen, ticketSubject, ticketType, ticketDescription, ticketMobile, ticketPriority, createTicket,
    navMenuOpen,
  }
}
