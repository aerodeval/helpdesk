// Studio imports this before it mounts anything, so the demo interceptor wraps every page's requests
import { isDemo, showRefreshNotice } from '@helpdesk/shared/demo'
import DemoDock from '@helpdesk/shared/demo/DemoDock.vue'
import { createApp } from 'vue'

// The settings dialog opens over any page at `<page>/settings/<screen>`.
export function settingsPath(pagePath: string, screens: string[]) {
  return [pagePath.replace(/\/$/, ''), 'settings', ...screens.map(encodeURIComponent)].join('/')
}

export default {
  extendRoute(route) {
    route.alias = `${route.path.replace(/\/$/, '')}/settings/:settings*`
  },
  setup(router) {
    // Links from when the dialog opened on `#settings/<screen>`.
    router.beforeEach((to) => {
      if (!to.hash.startsWith('#settings/')) return
      const screens = to.hash.slice('#settings/'.length).split('/')
      return { path: settingsPath(to.path, screens), query: to.query, replace: true }
    })
    // Studio mounts the app before the first navigation settles
    router.isReady().then(() => {
      showRefreshNotice()
      mountDemoDock()
    })
  },
}

// Studio owns the app instance, so the dock mounts its own, in a box on the viewport's bottom edge
function mountDemoDock() {
  if (!isDemo()) return
  const host = document.body.appendChild(document.createElement('div'))
  host.className = 'fixed inset-x-0 bottom-0 z-20'
  createApp(DemoDock).mount(host)
}
