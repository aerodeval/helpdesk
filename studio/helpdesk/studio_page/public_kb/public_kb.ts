import { ref, computed } from 'vue'

export default function setup(context) {
  const { articles, HD_Article_Category, route, router } = context

  const activeTab = ref('All')
  const searchQuery = ref('')

  // Opens the settings overlay (KbSettings.vue) via the URL hash.
  function openSettings(tab = 'profile') {
    router.push({ query: route.query, hash: `#settings/${tab}` })
  }

  const filteredArticles = computed(() => {
    if (!articles.data) return []
    let list = articles.data

    // Filter by search query
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase()
      list = list.filter(a => a.title && a.title.toLowerCase().includes(q))
    }

    // Filter by tab
    if (activeTab.value === 'New') {
      list = [...list].sort((a, b) => {
        const da = a.published_on ? new Date(a.published_on) : new Date(0)
        const db = b.published_on ? new Date(b.published_on) : new Date(0)
        return db - da
      })
    } else if (activeTab.value === 'Popular') {
      list = [...list].sort((a, b) => (b.views || 0) - (a.views || 0))
    }

    return list
  })

  return { activeTab, searchQuery, filteredArticles, openSettings }
}
