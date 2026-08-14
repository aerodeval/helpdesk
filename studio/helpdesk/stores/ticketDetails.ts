import { computed } from 'vue'
import { dayjs } from 'frappe-ui'

// Everything the details sidebar shows, worded and ordered as
// `desk/src/components/ticket/TicketCustomerSidebar.vue` words it. Each list is
// finished for display — label, value and badge theme — because the sidebar is
// drawn by Studio blocks that only bind.

const DATE_FORMAT = 'ddd, MMM D, YYYY h:mm A'
const EMPTY = '—'
// Their own rows above the template's, and skipped when it repeats them.
const PINNED_FIELDS = ['subject', 'team', 'priority']

export function useTicketDetails(ticket) {
  const data = computed(() => ticket.data || {})

  const contact = computed(() => ({
    name: data.value.contact?.name || data.value.raised_by || '',
    image: data.value.contact?.image || '',
  }))

  const basicInfo = computed(() => [
    field('Ticket ID', data.value.name),
    field('Status', data.value.status),
  ])

  const additionalInfo = computed(() => [
    field('Subject', data.value.subject),
    field('Team', data.value.agent_group),
    field('Priority', data.value.priority),
    ...templateFields(),
  ])

  // The template's own fields follow, minus anything it hides from the requester.
  function templateFields() {
    return (data.value.template?.fields || [])
      .filter(
        (templateField) =>
          !templateField.hide_from_customer &&
          !PINNED_FIELDS.includes(templateField.fieldname),
      )
      .map((templateField) =>
        field(
          templateField.label,
          formatValue(templateField, data.value[templateField.fieldname]),
        ),
      )
  }

  function field(label: string, value) {
    return { label, value: value || EMPTY }
  }

  function formatValue(templateField, value) {
    if (!value) return value
    if (templateField.fieldtype === 'Date') return dayjs(value).format('DD-MM-YYYY')
    if (templateField.fieldtype === 'Datetime') return dayjs(value).format(DATE_FORMAT)
    return value
  }

  const slaInfo = computed(() => [
    sla('First Response', firstResponse(), data.value.first_responded_on || data.value.response_by),
    sla('Resolution', resolution(), data.value.resolution_date || data.value.resolution_by),
  ])

  function sla(label: string, verdict, on: string) {
    return { label, ...verdict, tooltip: on ? dayjs(on).format(DATE_FORMAT) : '' }
  }

  function firstResponse() {
    const { first_responded_on: answered, response_by: due, creation } = data.value
    if (!answered && dayjs().isBefore(dayjs(due)))
      return badge(`Due in ${countdown(due)}`, 'orange')
    if (dayjs(answered).isBefore(dayjs(due)))
      return badge(`Fulfilled in ${elapsed(creation, answered)}`, 'green')
    return badge('Failed', 'red')
  }

  function resolution() {
    const { resolution_date: resolved, resolution_by: due, agreement_status } = data.value
    if (!resolved && dayjs().isBefore(dayjs(due)))
      return badge(`Due in ${countdown(due)}`, 'orange')
    if (agreement_status === 'Fulfilled')
      return badge(`Fulfilled in ${duration(data.value.resolution_time || 0)}`, 'green')
    return badge('Failed', 'red')
  }

  function badge(text: string, theme: string) {
    return { badge: text, theme }
  }

  function countdown(target: string) {
    return duration(dayjs(target).diff(dayjs(), 's'))
  }

  function elapsed(from: string, to: string) {
    return duration(dayjs(to).diff(dayjs(from), 's'))
  }

  /** `formatTime` from desk/src/utils.ts — days, hours, minutes, seconds. */
  function duration(seconds: number) {
    const parts = [
      [Math.floor(seconds / 86400), 'd'],
      [Math.floor((seconds % 86400) / 3600), 'h'],
      [Math.floor((seconds % 3600) / 60), 'm'],
    ]
      .filter(([value]) => value)
      .map(([value, unit]) => `${value}${unit}`)
    const rest = Math.floor(seconds % 60)
    if (rest || !parts.length) parts.push(`${rest}s`)
    return parts.join(' ')
  }

  return {
    contact,
    basicInfo,
    slaInfo,
    additionalInfo,
    // HD Ticket stores the rating as a fraction; the Rating component counts stars.
    feedbackRating: computed(() => (data.value.feedback_rating || 0) * 5),
    feedbackLabel: computed(() => data.value.feedback || ''),
    feedbackComment: computed(() => data.value.feedback_extra || ''),
  }
}
