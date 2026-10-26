// The portal side of the guided tour: the customer-first intro, and the main tour's portal stops.
import { loginUrl } from '@helpdesk/shared/demo'
import { tour } from '@helpdesk/shared/demo/tour'
import { ROUTES } from '@helpdesk/shared/portalRoutes'
import { call } from 'frappe-ui'

const RAISED_TICKET = {
  subject: 'Do old invoice PDFs pick up our new logo?',
  description:
    '<p>Hi, we changed our logo last week. If we download an invoice we sent last month again, does the PDF show the new logo or the old one?</p><p>Priya</p>',
}

export function startDemoTour(router: any) {
  // the same call the new ticket form makes, so the fake records it as the visitor's
  const raiseTicket = async () => {
    const ticket = await call('helpdesk.helpdesk.doctype.hd_ticket.api.new', { doc: RAISED_TICKET })
    await router.push(ROUTES.ticket(ticket.name))
  }
  return tour.start({
    persona: 'customer',
    stops: {
      intro_help: { anchors: () => ['kb-search'] },
      intro_raise: { anchors: () => ['page-action'], showMe: raiseTicket },
      portal_new: { anchors: () => ['page-action'], showMe: raiseTicket },
      portal_back: { anchors: () => ['dock'], showMe: async () => location.assign(loginUrl('agent')) },
    },
    navigate: (to) => router.push(to),
    onRoute: (callback) => router.afterEach(callback),
    actionDone: ({ type, payload }) =>
      type === 'insert' && payload.doctype === 'HD Ticket' ? 'raise_ticket' : undefined,
  })
}
