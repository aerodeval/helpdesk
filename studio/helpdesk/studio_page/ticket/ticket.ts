import { computed, watch } from 'vue'
import { call, createResource, toast } from 'frappe-ui'
import { useSettingsModal } from '@app/stores/settings'
import { SETTLED, useTicketThread } from '@app/stores/ticketThread'
import { useTicketDetails } from '@app/stores/ticketDetails'
import { useTicketFeedback } from '@app/stores/ticketFeedback'

// One ticket, read and replied to from the portal — the customer half of the agent
// portal's `desk/src/pages/ticket/TicketCustomer.vue`. The page is drawn entirely
// from Studio blocks, so this returns display-ready state and named actions: the
// blocks bind, they never compute.
export default function setup(context) {
  const { route } = context
  const settings = useSettingsModal(context)
  const { config } = settings
  // The composer shows the reader's own avatar, which rides on the settings payload.
  settings.loadSettings()

  const ticketId = computed(() => String(route?.params?.name || ''))

  // The one call the agent portal makes: it answers with the communications, so the
  // thread costs no second request.
  const ticket = createResource({
    url: 'helpdesk.helpdesk.doctype.hd_ticket.api.get_one',
    makeParams: () => ({ name: ticketId.value }),
  })

  watch(ticketId, (name) => name && ticket.fetch(), { immediate: true })

  const feedback = useTicketFeedback(ticket)
  const thread = useTicketThread(ticket)

  // The topbar carries the page's action, the way TicketCustomer keeps Close in its
  // LayoutHeader. Label and icon travel as data; the click calls `onPageAction`,
  // because a function does not survive a Studio prop binding. The header hides the
  // button on an empty label.
  //
  // Resolved keeps its Close: support believing a ticket is fixed is not the same as the
  // customer being done with it. It goes only where the customer can no longer act — a
  // ticket already Closed, or one they have rated, since `check_update_perms` refuses
  // non-agent writes after either.
  const pageActionLabel = computed(() => {
    const data = ticket.data
    if (!data || data.status === 'Closed' || data.feedback) return ''
    return 'Close'
  })

  // Nothing to rate on a ticket nobody answered, so the dialog waits on a reply from
  // the other side — the same test as TicketCustomer's `showFeedback`.
  const wantsFeedback = computed(
    () =>
      Boolean(thread.lastAgentReply.value) &&
      Boolean(config.value?.is_feedback_mandatory),
  )

  // "Did this solve it?", asked inline under the newest agent reply.
  //
  // Hung off the *latest* reply rather than repeated under every one: the question is
  // always about where the conversation currently stands, and one live ask reads as a
  // conversation while N stacked ones read as nagging. It moves down as the agent
  // replies again.
  //
  // Renders nothing once the ticket is settled, or for anyone who is not the person who
  // raised it. Resolved counts as settled: the thread already carries a card saying so,
  // and asking "did this solve your issue?" beside it reads as the portal not knowing its
  // own state. The question belongs to a ticket still in flight — an agent replies, the
  // ticket sits at Replied, and answering is what moves it on.
  //
  // Keyed on status alone, which is also all the confirmation writes — so a reopened
  // ticket asks again, as it should.
  const solvePromptAt = computed(() => {
    const data = ticket.data
    if (!data || SETTLED.includes(data.status)) return null
    const viewer = config.value?.session_user
    if (viewer && data.raised_by && viewer !== data.raised_by) return null
    // Which message is support's is the thread store's business — it owns the row shape
    // and the raiser-identity matching.
    return thread.lastAgentReply.value?.name || null
  })

  // Calling a reply the fix is also saying what the fix was, so the confirmation records
  // that reply as the ticket's resolution — the agent's own words promoted, not a
  // paraphrase, and the same text the desk's Resolution Details field would hold. Never
  // over an account an agent wrote themselves: theirs is the fuller story.
  function resolutionFields() {
    const reply = thread.lastAgentReply.value
    if (!reply || ticket.data?.resolution_details) return {}
    return { resolution_details: reply.content }
  }

  // Yes marks the ticket resolved, records what resolved it, and asks for the rating.
  //
  // When the helpdesk requires feedback, the status cannot be written first —
  // `validate_feedback` refuses to let a non-agent enter the Resolved category without a
  // rating — so the dialog's single save carries the lot. Where feedback is optional the
  // status goes in straight away, because the reader may dismiss the dialog and their
  // confirmation should survive that.
  async function confirmSolved() {
    if (wantsFeedback.value)
      return feedback.openFeedback('Resolved', resolutionFields())
    try {
      await call('frappe.client.set_value', {
        doctype: 'HD Ticket',
        name: ticketId.value,
        fieldname: { status: 'Resolved', ...resolutionFields() },
      })
      ticket.fetch()
      feedback.openFeedback('Resolved')
    } catch (error) {
      toast.error(error?.messages?.[0] || 'Could not mark this as resolved')
    }
  }

  // No is never a dead end: an agent reply usually leaves the ticket "Replied", so this
  // puts it back to Open and into the queue rather than just dismissing the question.
  async function reopenTicket() {
    try {
      await call('frappe.client.set_value', {
        doctype: 'HD Ticket',
        name: ticketId.value,
        fieldname: 'status',
        value: 'Open',
      })
      ticket.fetch()
      toast.success('Reopened — we will take another look')
    } catch (error) {
      toast.error(error?.messages?.[0] || 'Could not reopen this ticket')
    }
  }

  function onPageAction() {
    if (wantsFeedback.value) return feedback.openFeedback()
    settings.askConfirm({
      title: 'Close ticket',
      message: 'Are you sure you want to close this ticket?',
      label: 'Close',
      action: closeTicket,
    })
  }

  async function closeTicket() {
    try {
      await call('frappe.client.set_value', {
        doctype: 'HD Ticket',
        name: ticketId.value,
        fieldname: 'status',
        value: 'Closed',
      })
      ticket.fetch()
    } catch (error) {
      toast.error(error?.messages?.[0] || 'Could not close this ticket')
    }
  }

  return {
    ...settings,
    ...thread,
    ...useTicketDetails(ticket, thread),
    ...feedback,
    ticketId,
    ticket,
    pageActionLabel,
    pageActionIcon: 'check',
    onPageAction,
    solvePromptAt,
    confirmSolved,
    reopenTicket,
  }
}
