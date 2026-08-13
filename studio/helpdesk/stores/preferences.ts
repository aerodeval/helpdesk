import { computed, ref } from 'vue'
import { createDocumentResource, createResource, toast } from 'frappe-ui'

// Language & timezone for the signed-in user, shown in the settings dialog's Profile
// panel. Both live on the User doc, which a signed-in user may edit for themselves, so
// this talks to that doc directly rather than through helpdesk.api.organization.
// Theme is deliberately absent — the portal ships light only.

const store = createPreferencesStore()

export function usePreferences() {
  return store
}

function createPreferencesStore() {
  // The User doc resource, created once the settings payload names the signed-in user.
  const user = ref(null)
  const languageOptions = ref([])
  const timezoneOptions = ref([])

  const preferences = computed(() => user.value?.doc || {})
  const preferencesSaving = computed(() => Boolean(user.value?.save.loading))

  const preferencesDirty = computed(() => {
    const saved = user.value?.originalDoc
    if (!saved) return false
    return (
      preferences.value.language !== saved.language ||
      preferences.value.time_zone !== saved.time_zone
    )
  })

  // Called from the settings store on load, so nothing is fetched until the dialog
  // opens. Takes the User's docname — for Administrator that is not the email.
  function loadPreferences(userName) {
    if (!userName || user.value?.name === userName) return
    user.value = createDocumentResource({ doctype: 'User', name: userName })
    if (!languageOptions.value.length) languages.fetch()
    if (!timezoneOptions.value.length) timezones.fetch()
  }

  // Autocomplete hands back the chosen option (or null on clear); an empty pick falls
  // back to the saved value so a stray clear cannot blank the field.
  function setPreference(field, option) {
    if (!user.value?.doc) return
    user.value.doc[field] = option?.value || user.value.originalDoc?.[field]
  }

  function savePreferences() {
    user.value?.save.submit(null, {
      onSuccess: () => {
        toast.success('Preferences updated successfully.')
        // Language and timezone are read at boot, so the change needs a reload.
        window.location.reload()
      },
      onError: (error) => toast.error(error.message),
    })
  }

  const languages = createResource({
    url: 'frappe.client.get_list',
    params: {
      doctype: 'Language',
      fields: ['name', 'language_name'],
      limit_page_length: 0,
      order_by: 'language_name asc',
    },
    onSuccess: (rows) =>
      (languageOptions.value = rows.map((row) => ({
        label: row.language_name || row.name,
        value: row.name,
      }))),
  })

  const timezones = createResource({
    url: 'frappe.core.doctype.user.user.get_timezones',
    onSuccess: (data) =>
      (timezoneOptions.value = data.timezones.map((zone) => ({ label: zone, value: zone }))),
  })

  return {
    preferences,
    preferencesDirty,
    preferencesSaving,
    languageOptions,
    timezoneOptions,
    loadPreferences,
    setPreference,
    savePreferences,
  }
}
