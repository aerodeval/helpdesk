import { computed, ref } from 'vue'
import { call } from 'frappe-ui'

// Who is looking at the portal, and what it may offer them. The published Studio app
// is rendered from a bare template with no boot payload, so login state has to be
// asked for — `helpdesk.api.config.get_config` is the one endpoint the helpdesk
// already exposes to guests, and it carries the ticket setting too.

const store = createSessionStore()

export function useSession(context) {
  if (context?.router) store.bindRouter(context.router)
  store.loadSession()
  return store
}

function createSessionStore() {
  const config = ref(null)
  let router = null
  let loading = null

  // Guest until told otherwise: the topbar renders before the call returns, and
  // showing "Log in" to a signed-in user for a moment beats the reverse.
  const isGuest = computed(() => (config.value?.session_user || 'Guest') === 'Guest')

  /** Signed-in customers always may; a visitor only when the helpdesk allows it. */
  const canCreateTicket = computed(
    () => !isGuest.value || Boolean(config.value?.allow_anyone_to_create_tickets)
  )

  // Back to the page they were reading, not to the agent desk.
  const loginUrl = computed(
    () =>
      `/login?redirect-to=${encodeURIComponent(
        window.location.pathname + window.location.search
      )}`
  )

  const knowledgeBase = { icon: 'lucide-book', label: 'Knowledge base', onClick: () => go('/') }

  // A guest has no tickets, account or session to offer, so the menu keeps only what
  // works signed out.
  const accountMenuOptions = computed(() =>
    isGuest.value
      // `lucide-user` rather than `lucide-log-in`: icons are collected from the
      // scanned sources, and this app sits outside them — an icon no other bundled
      // file uses renders as an empty slot.
      ? [knowledgeBase, { icon: 'lucide-user', label: 'Log in', onClick: signIn }]
      : [
          { icon: 'lucide-inbox', label: 'My tickets', onClick: () => go('/customer-tickets') },
          knowledgeBase,
          { icon: 'lucide-user', label: 'My account', onClick: openSettings },
          { icon: 'lucide-settings', label: 'Settings', onClick: openSettings },
          { icon: 'lucide-log-out', label: 'Log out', onClick: signOut },
        ]
  )

  function loadSession() {
    if (loading) return loading
    loading = call('helpdesk.api.config.get_config')
      .then((data) => (config.value = data))
      .catch((error) => console.error(error))
    return loading
  }

  function bindRouter(value) {
    router = router || value
  }

  function go(path) {
    router?.push(path)
  }

  function openSettings() {
    router?.push({ hash: '#settings/profile' })
  }

  function signIn() {
    window.location.href = loginUrl.value
  }

  // Posted rather than navigated to: frappe only accepts POST on logout, so following
  // the link landed on a 403 page without ending the session. Back to the knowledge
  // base afterwards — signing out of the portal should leave you in it, as a visitor.
  async function signOut() {
    try {
      await call('logout')
    } catch (error) {
      console.error(error)
    }
    window.location.href = '/kb'
  }

  return { isGuest, canCreateTicket, loginUrl, accountMenuOptions, loadSession, bindRouter }
}
