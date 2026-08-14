import { computed, watch } from 'vue'
import { call, createResource } from 'frappe-ui'
import { useSettingsModal } from '@app/stores/settings'
import { useTicketThread } from '@app/stores/ticketThread'
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

  // The topbar carries the page's action, the way TicketCustomer keeps Close in its
  // LayoutHeader. Label and icon travel as data; the click calls `onPageAction`,
  // because a function does not survive a Studio prop binding.
  const pageActionLabel = computed(() =>
    ticket.data && ticket.data.status !== 'Closed' ? 'Close' : '',
  )

  // Nothing to rate on a ticket nobody answered, so the dialog waits on a reply from
  // the other side — the same test as TicketCustomer's `showFeedback`.
  const wantsFeedback = computed(() => {
    const answered = (ticket.data?.communications || []).some(
      (message) => message.sender !== ticket.data?.raised_by,
    )
    return answered && Boolean(config.value?.is_feedback_mandatory)
  })

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
    await call('frappe.client.set_value', {
      doctype: 'HD Ticket',
      name: ticketId.value,
      fieldname: 'status',
      value: 'Closed',
    })
    ticket.fetch()
  }

  return {
    ...settings,
    ...useTicketThread(ticket),
    ...useTicketDetails(ticket),
    ...feedback,
    ticketId,
    ticket,
    pageActionLabel,
    pageActionIcon: 'check',
    onPageAction,
  }
}
