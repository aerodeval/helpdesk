import { computed } from 'vue'
import { dayjs } from 'frappe-ui'

// Everything the summary sidebar shows. Each list is finished for display — label,
// value, wording — because the sidebar is drawn by Studio blocks that only bind.
//
// Where the agent portal's `TicketCustomerSidebar.vue` reports SLA compliance, this
// tells the same facts as a lifecycle: when the ticket arrived, when it was answered
// and how fast, whether it is finished. Same fields, read as progress rather than as
// a report card — "Failed" is not a useful thing to show the person still waiting.

const DATE_FORMAT = 'ddd, MMM D, YYYY h:mm A'
const STEP_FORMAT = 'ddd D MMM, h:mm a'
const EMPTY = '—'
// Not repeated from the template. `team` and `priority` get their own rows above it;
// `subject` is dropped outright — it is already the page's heading and breadcrumb.
const PINNED_FIELDS = ['subject', 'team', 'priority']

export function useTicketDetails(ticket, thread) {
  const data = computed(() => ticket.data || {})
  const firstReply = computed(() => thread?.firstAgentReply.value)

  const contact = computed(() => ({
    name: data.value.contact?.name || data.value.raised_by || '',
    image: data.value.contact?.image || '',
  }))

  const basicInfo = computed(() => [
    field('Ticket ID', data.value.name),
    field('Status', data.value.status),
  ])

  const additionalInfo = computed(() => [
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

  // The four milestones every ticket has. No per-message rows: the thread on the
  // left already is the messages, and repeating them here would say nothing new.
  const timeline = computed(() => {
    const steps = [received(), assigned(), answered(), resolved()]
    // The amber ring marks one thing to watch, so it goes on the frontier: the first
    // unmet milestone *past* everything already reached. Searching from the top would
    // ring a step that later ones have overtaken — a ticket can be answered without
    // ever having been formally assigned.
    let reached = -1
    steps.forEach((step, index) => {
      if (step.state === 'done' || step.state === 'closed') reached = index
    })
    const next = steps.slice(reached + 1).find((step) => step.state === 'pending')
    if (next) next.state = 'next'
    return steps
  })

  function received() {
    return step('Request received', at(data.value.creation), 'done')
  }

  // When support took it on. No assignment timestamp is readable by a customer — the ToDo
  // behind an assignment and HD Ticket Activity are both agent-only — so the first agent
  // reply stands in for it: the moment support demonstrably had the ticket. That makes the
  // stamp an upper bound on when it was picked up, and the closest honest one available.
  //
  // A reply counts as ownership on its own. Assignment is optional in Frappe, so a ticket
  // an agent has answered can still carry an empty `_assign` — and telling the customer
  // nobody has picked it up, directly above that agent's answer, is a lie. `_assign` alone
  // buys only a state: it carries bare user ids and no time.
  function assigned() {
    const reply = firstReply.value
    if (reply) return step('Assigned to agent', at(reply.creation), 'done')
    if (assignees().length) return step('Assigned to agent', 'An agent is on it', 'done')
    return step('Assigned to agent', 'Waiting to be assigned', 'pending')
  }

  function assignees() {
    try {
      return JSON.parse(data.value._assign || '[]')
    } catch {
      return []
    }
  }

  function answered() {
    const reply = firstReply.value
    if (!reply) return awaiting('First Response', data.value.response_by)
    return step(`First Response from ${reply.sender}`, at(reply.creation), 'done')
  }

  function resolved() {
    const { status, resolution_date: on } = data.value
    if (!on) return awaiting('Resolution', data.value.resolution_by)
    // Named for where the ticket ended, and nothing finer: who called it — agent or
    // customer — is the thread card's story, not a distinction the rail needs to draw.
    const closed = status === 'Closed'
    return step(closed ? 'Closed' : 'Resolved', at(on), closed ? 'closed' : 'done')
  }

  /** A milestone still owed: a countdown while there is time, a breach once there isn't. */
  function awaiting(title: string, due: string) {
    if (!due) return step(title, 'Pending', 'pending')
    if (dayjs().isAfter(dayjs(due))) return step(title, `Overdue by ${countdown(due)}`, 'breach')
    return step(title, `Due in ${countdown(due)}`, 'pending')
  }

  function step(title: string, subtitle: string, state: string) {
    return { title, subtitle, state }
  }

  function at(value: string) {
    return value ? dayjs(value).format(STEP_FORMAT) : ''
  }

  /** Distance to a target, either side of it — the caller words the direction. */
  function countdown(target: string) {
    return duration(Math.abs(dayjs(target).diff(dayjs(), 's')))
  }

  // The two most significant units, as `formatSeconds` words them in the agent portal's
  // analytics: "2d 9h", "44m". Never four — and never trailing seconds on anything
  // larger, because a countdown that only re-renders on load reads as a frozen timer
  // when it shows them (the reasoning behind `coarseDuration` in desk's useSLA.ts).
  function duration(seconds: number) {
    const parts = [
      [Math.floor(seconds / 86400), 'd'],
      [Math.floor((seconds % 86400) / 3600), 'h'],
      [Math.floor((seconds % 3600) / 60), 'm'],
      [Math.floor(seconds % 60), 's'],
    ]
      .filter(([value]) => value)
      .map(([value, unit]) => `${value}${unit}`)
    return parts.slice(0, 2).join(' ') || '0s'
  }

  return {
    contact,
    basicInfo,
    timeline,
    additionalInfo,
  }
}
