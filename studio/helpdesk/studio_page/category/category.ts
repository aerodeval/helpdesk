import { ref, computed, watch } from 'vue'
import { useSettingsModal } from '@app/stores/settings'

export default function setup(context) {
  const { category, articles, route, router, call } = context

  const searchQuery = ref('')
  const navMenuOpen = ref(false)

  // The list resource carries the author's user id, so rows showed "Administrator"
  // beside an empty avatar. This endpoint resolves every author in the category to a
  // display name and picture in one call; it needs a session, so a guest keeps the
  // id fallback below rather than losing the byline.
  const authors = ref({})

  async function loadAuthors(categoryName) {
    if (!categoryName) return
    try {
      const rows = await call('helpdesk.api.knowledge_base.get_category_articles', {
        category: categoryName,
      })
      authors.value = Object.fromEntries(
        (rows || []).map((row) => [row.name, row.author])
      )
    } catch (error) {
      authors.value = {}
    }
  }

  function authorOf(articleName) {
    return authors.value[articleName] || {}
  }

  // Reload data whenever the route param changes
  watch(
    () => route.params.category,
    (val) => {
      if (val) {
        category.reload()
        articles.reload()
        loadAuthors(val)
      }
    },
    { immediate: true }
  )

  const filteredArticles = computed(() => {
    const rows = articles.data || []
    const q = searchQuery.value.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (a) =>
        (a.title || '').toLowerCase().includes(q) ||
        getArticleExcerpt(a.content).toLowerCase().includes(q)
    )
  })

  const categoryName = computed(() => category.data?.category_name || route.params.category || '')
  const categoryDescription = computed(() => {
    const desc = category.data?.description
    if (desc) return desc
    const name = categoryName.value
    return name ? `Find answers to common ${name} questions.` : ''
  })

  function getArticleExcerpt(content) {
    if (!content) return ''
    const plain = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    return plain.length > 120 ? plain.slice(0, 120) + '…' : plain
  }

  function getInitials(name) {
    if (!name) return '?'
    return name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('')
  }

  function timeAgo(dateStr) {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diff = Math.floor((now - date) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`
    if (diff < 2592000) return `${Math.floor(diff / 86400)} days ago`
    if (diff < 31536000) return `${Math.floor(diff / 2592000)} months ago`
    return `${Math.floor(diff / 31536000)} yr ago`
  }

  function navigateToArticle(name) {
    router.push({ path: `/articles/${name}` })
  }

  // Thumbnail: the article has no dedicated image field, so use the first image
  // embedded in its content. Returns '' when the article has none (the row then
  // falls back to a document icon).
  function articleImage(content) {
    if (!content) return ''
    const match = content.match(/<img[^>]+src=["']([^"']+)["']/i)
    return match ? match[1] : ''
  }
  function articleThumbnailHtml(content) {
    const src = articleImage(content)
    return src
      ? `<img src="${src}" style="width:100%;height:100%;object-fit:cover" alt="" />`
      : ''
  }

  return {
    ...useSettingsModal(context),
    navMenuOpen,
    searchQuery,
    filteredArticles,
    categoryName,
    categoryDescription,
    getArticleExcerpt,
    getInitials,
    authorOf,
    timeAgo,
    navigateToArticle,
    articleImage,
    articleThumbnailHtml,
  }
}
