import { reactive, computed } from 'vue'
import { useSettingsModal } from '@app/stores/settings'

// New ticket form. The middle fields render through a Repeater over the HD Ticket
// Template's field list (`fields`); each repeated FormControl reads its value with
// `{{ getField(dataItem.fieldname) }}` and writes back via an `update:modelValue`
// Run-Script calling `setField`. The suggested-articles card is a separate custom
// component (KbArticleSuggestions.vue) fed the subject variable as `query`.
export default function setup(context) {
  const { subject, description, template, ticketTypes, newTicket, router, route } = context

  // Arriving from the help page: whatever was searched for becomes the subject, so
  // nobody retypes it — and it immediately feeds the suggested-articles card.
  const searched = String(route?.query?.subject || '').trim()
  if (searched && !subject.value) subject.value = searched

  // Values for the template-driven fields, keyed by fieldname.
  const model = reactive({})

  const fields = computed(() =>
    (template.data?.fields || []).filter((f) => !f.hide_from_customer)
  )

  function getField(name) {
    return model[name] ?? ''
  }
  function setField(name, value) {
    model[name] = value
  }

  // TextEditor models `content` and emits `change` — it has no `modelValue`, so
  // Studio's automatic variable binding never fires and the description block
  // writes back through here instead.
  function setDescription(html) {
    description.value = html
  }

  function controlType(fieldtype) {
    if (fieldtype === 'Select') return 'select'
    if (fieldtype === 'Link') return 'autocomplete'
    return 'text'
  }

  function optionsFor(field) {
    if (field.fieldtype === 'Link') {
      return (ticketTypes.data || []).map((t) => ({ label: t.name, value: t.name }))
    }
    if (field.fieldtype === 'Select') {
      return (field.options || '')
        .split('\n')
        .map((o) => o.trim())
        .filter(Boolean)
        .map((o) => ({ label: o, value: o }))
    }
    return []
  }

  const canSubmit = computed(() => {
    const descEmpty = (description.value || '').replace(/<[^>]*>/g, '').trim().length === 0
    if (!subject.value || descEmpty) return false
    return fields.value.filter((f) => f.required).every((f) => model[f.fieldname])
  })

  function createTicket() {
    if (!canSubmit.value) return
    newTicket
      .submit({
        doc: { subject: subject.value, description: description.value, template: 'Default', ...model },
        attachments: [],
      })
      .then(() => router.push('/customer-tickets'))
  }

  return {
    ...useSettingsModal(context),
    fields, getField, setField, setDescription, controlType, optionsFor, canSubmit, createTicket,
  }
}
