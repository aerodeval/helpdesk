import { ref, computed } from 'vue'
import { useSettingsModal } from '@app/stores/settings'

export default function setup(context) {
  const { articles, HD_Article_Category, route } = context

  const searchQuery = ref('')
  const activeTab = ref('All')

  const filteredArticles = computed(() => {
    const data = articles.data || []
    const q = searchQuery.value.toLowerCase()
    const filtered = q
      ? data.filter(a =>
          (a.title || '').toLowerCase().includes(q) ||
          (a.content || '').toLowerCase().includes(q)
        )
      : data

    if (activeTab.value === 'New') {
      return [...filtered].sort((a, b) => new Date(b.published_on) - new Date(a.published_on))
    }
    if (activeTab.value === 'Popular') {
      return [...filtered].sort((a, b) => (b.views || 0) - (a.views || 0))
    }
    return filtered
  })

  const categoryData = computed(() => HD_Article_Category.data || [])

  function timeAgo(dateStr) {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diff = Math.floor((now - date) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`
    if (diff < 2592000) return `${Math.floor(diff / 86400)} days ago`
    if (diff < 31536000) return `${Math.floor(diff / 2592000)} months ago`
    return `${Math.floor(diff / 31536000)} years ago`
  }

  function getExcerpt(content) {
    if (!content) return ''
    const stripped = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    return stripped.length > 120 ? stripped.slice(0, 120) + '…' : stripped
  }

  function getInitials(name) {
    if (!name) return '?'
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  }

  const navMenuOpen = ref(false)

  return {
    ...useSettingsModal(),
    navMenuOpen,
    searchQuery,
    activeTab,
    filteredArticles,
    categoryData,
    timeAgo,
    getExcerpt,
    getInitials
  }
}
