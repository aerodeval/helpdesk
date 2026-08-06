import { useSettingsModal } from '@app/stores/settings'

// The help page's body is a custom component (KbHelpSearch.vue); the script exists so
// the settings dialog dropped on this page binds to the same store as every other page.
export default function setup(context) {
  return { ...useSettingsModal(context) }
}
