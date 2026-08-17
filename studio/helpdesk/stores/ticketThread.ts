import { computed, ref, watch } from 'vue'
import { call, createResource, dayjs, toast } from 'frappe-ui'

// The message thread, the outside-working-hours banner and the reply composer —
// the data behind `desk/src/pages/ticket/TicketConversation.vue` and
// `TicketTextEditor.vue`. The page draws all of it from Studio blocks, so every
// value a block binds is finished here: no formatting is left to an expression.

const DATE_FORMAT = 'ddd, MMM D, YYYY h:mm A'
const UPLOAD_ARGS = { folder: 'Home/Helpdesk', private: true }

/** A ticket whose story is over. Both statuses end the customer's part in it. */
export const SETTLED = ['Resolved', 'Closed']

// The resolution card's two palettes. Green for a fix, grey for a ticket that merely
// ended — `--surface-green-7` / `--outline-gray-4` are frappe-ui's own solid marks.
//
// The fills are already the palest step in each ramp, so the tint is carried by the
// border: one step down from `-3` keeps the card legible without it reading as a callout
// beside the message cards, whose edges are a soft shadow rather than a line.
const RESOLVED_TONE = {
  mark: '✓',
  cardBackground: 'var(--surface-green-1)',
  cardBorder: '1px solid var(--outline-green-2)',
  markBackground: 'var(--surface-green-7)',
  titleColor: 'var(--ink-green-7)',
}
const CLOSED_TONE = {
  // A tick claims the problem was solved; closing only says the ticket ended.
  mark: '−',
  cardBackground: 'var(--surface-gray-1)',
  cardBorder: '1px solid var(--outline-gray-1)',
  markBackground: 'var(--outline-gray-4)',
  titleColor: 'var(--ink-gray-8)',
}

export function useTicketThread(ticket) {
  const conversation = computed(() => {
    const rows = sortByCreation().map(toMessageRow)
    const resolution = toResolutionRow(rows)
    if (resolution) rows.push(resolution)
    const rating = toRatingRow()
    if (rating) rows.push(rating)
    // The rail's line runs down to the next marker, so only the final row stops short.
    rows.forEach((row, index) => {
      row.railHeight = index === rows.length - 1 ? '20px' : '100%'
    })
    return rows
  })

  // The agent portal lands the reader on the newest message a second after the
  // thread arrives, or on the one the URL hash names — `TicketConversation` waits
  // the same second, because the email frames only size themselves after paint.
  let landed = false
  watch(conversation, (messages) => {
    if (landed || !messages.length) return
    landed = true
    const id = location.hash.slice(1) || messages[messages.length - 1].name
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'nearest' }), 1000)
  })

  function sortByCreation() {
    return [...(ticket.data?.communications || [])].sort(
      (first, second) =>
        new Date(first.creation).getTime() - new Date(second.creation).getTime(),
    )
  }

  function toMessageRow(message) {
    return {
      name: message.name,
      content: message.content,
      sender: message.user?.name || message.sender,
      image: message.user?.image,
      // Kept raw as well as worded: the sidebar's timeline dates and measures it.
      creation: message.creation,
      timeAgo: timeAgo(message.creation),
      fullDate: dayjs(message.creation).format(DATE_FORMAT),
      attachments: message.attachments || [],
      // Whether support wrote it. Frappe already records the direction, so ask it rather
      // than comparing identities: `sender` is an email while `raised_by` can be a User
      // docname ("Administrator"), and that mismatch made every message — the customer's
      // own included — look like an agent reply.
      isAgentReply: message.sent_or_received === 'Sent',
      railHeight: '100%',
    }
  }

  // Being resolved is an event rather than a message, but it belongs in the thread at the
  // point it happened, so it rides along as a row the blocks draw differently.
  //
  // The body is `resolution_details` — written by the agent from the desk, or by the
  // customer's own "Yes, it's fixed", which records the reply it is confirming. A ticket
  // closed without either has none, so the closing reply stands in: the last thing support
  // said is in practice what they did.
  function toResolutionRow(rows) {
    const data = ticket.data
    if (!SETTLED.includes(data?.status) || !data.resolution_date) return null
    const closingReply = [...rows].reverse().find((row) => row.isAgentReply)
    const closed = data.status === 'Closed'
    return {
      name: 'resolution',
      isResolution: true,
      label: closed ? 'Closed' : 'Resolved',
      // Closed is an ending, not an outcome — a ticket can be closed without ever being
      // fixed — so it settles to grey and leaves green to mean "actually resolved", the
      // same distinction the sidebar rail draws. Studio evaluates baseStyles values, so
      // the palette rides on the row rather than forking the card into two templates.
      ...(closed ? CLOSED_TONE : RESOLVED_TONE),
      content: data.resolution_details || closingReply?.content || '',
      attachments: [],
      railHeight: '20px',
    }
  }

  /** The newest message from support — what the "did this solve it?" prompt hangs off. */
  const lastAgentReply = computed(
    () => [...conversation.value].reverse().find((row) => row.isAgentReply) || null,
  )

  // When support first answered. Deliberately a message and not the ticket's
  // `first_responded_on`: that field is stamped on a status transition — into Paused,
  // or Open to Resolved — so it misses a ticket that was answered and left open, and
  // invents one for a ticket resolved without a word.
  const firstAgentReply = computed(
    () => conversation.value.find((row) => row.isAgentReply) || null,
  )

  // The customer's own rating, told back to them in the thread where they left it
  // rather than filed in a sidebar. Dated from `resolution_date` because HD Ticket
  // stamps no time of its own for feedback — it is collected as part of closing, so
  // that is the closest true moment.
  function toRatingRow() {
    const data = ticket.data
    if (!data?.feedback_rating) return null
    const when = data.resolution_date || data.modified
    return {
      name: 'feedback',
      isRating: true,
      // HD Ticket stores the rating as a fraction; the Rating component counts stars.
      rating: data.feedback_rating * 5,
      label: data.feedback || '',
      comment: data.feedback_extra ? `"${data.feedback_extra}"` : '',
      sender: data.contact?.name || data.raised_by || '',
      image: data.contact?.image || '',
      timeAgo: timeAgo(when),
      fullDate: dayjs(when).format(DATE_FORMAT),
      attachments: [],
      railHeight: '20px',
    }
  }

  function openAttachment(url: string) {
    window.open(url, '_blank')
  }

  // `prettyDate` from desk/src/utils.ts, not dayjs's own `fromNow`: the agent portal
  // words a week as a week where dayjs would still be counting days.
  function timeAgo(value: string) {
    const seconds = dayjs().diff(dayjs(value), 'second')
    const days = Math.floor(seconds / 86400)
    if (days < 1) return withinDay(seconds)
    if (days < 2) return 'Yesterday'
    return olderThanDay(days)
  }

  function withinDay(seconds: number) {
    if (seconds < 60) return 'Just now'
    if (seconds < 120) return '1 minute ago'
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`
    if (seconds < 7200) return '1 hour ago'
    return `${Math.floor(seconds / 3600)} hours ago`
  }

  function olderThanDay(days: number) {
    if (days < 7) return `${days} days ago`
    if (days < 14) return '1 week ago'
    if (days < 31) return `${Math.floor(days / 7)} weeks ago`
    if (days < 62) return '1 month ago'
    if (days < 365) return `${Math.floor(days / 30)} months ago`
    if (days < 730) return '1 year ago'
    return `${Math.floor(days / 365)} years ago`
  }

  return {
    lastAgentReply,
    firstAgentReply,
    conversation,
    openAttachment,
    ...useOutsideHoursBanner(ticket),
    ...useReplyComposer(ticket),
  }
}

// The same endpoint the agent portal asks, and the same dismissal: remembered per
// ticket per day, so it returns tomorrow if the ticket is still unanswered.
function useOutsideHoursBanner(ticket) {
  const banner = createResource({
    url: 'helpdesk.helpdesk.doctype.hd_ticket.api.show_outside_hours_banner',
    makeParams: () => ({ ticket_name: ticket.data?.name }),
  })
  const dismissed = ref(false)

  watch(
    () => ticket.data?.name,
    (name) => {
      if (!name) return
      dismissed.value = localStorage.getItem(dismissKey(name)) === 'true'
      banner.fetch()
    },
    { immediate: true },
  )

  function dismissKey(name: string) {
    return `dismissBanner_${name}_${new Date().toISOString().split('T')[0]}`
  }

  function dismissBanner() {
    localStorage.setItem(dismissKey(ticket.data.name), 'true')
    dismissed.value = true
  }

  return {
    showBanner: computed(() => Boolean(banner.data?.show) && !dismissed.value),
    bannerMessage: computed(() => banner.data?.msg || ''),
    dismissBanner,
  }
}

function useReplyComposer(ticket) {
  const composerOpen = ref(false)
  const reply = ref('')
  const attachments = ref<any[]>([])
  const sending = ref(false)

  // Only a closed ticket refuses replies — `TicketCustomer.vue`'s `showEditor`.
  // Resolved is not closed: replying to it reopens the ticket, which is what
  // `create_communication_via_contact` does with `ticket_reopen_status`.
  const canReply = computed(() => ticket.data?.status !== 'Closed')

  // Tags alone are not a message: an empty editor still reports `<p></p>`.
  const canSend = computed(
    () => reply.value.replace(/<[^>]*>/g, '').trim().length > 0,
  )

  function openComposer() {
    composerOpen.value = true
  }

  function setReply(content: string) {
    reply.value = content
  }

  function addAttachment(file) {
    attachments.value = [...attachments.value, file]
  }

  function removeAttachment(file) {
    attachments.value = attachments.value.filter(
      (attached) => attached.file_url !== file.file_url,
    )
  }

  function discard() {
    reply.value = ''
    attachments.value = []
    composerOpen.value = false
  }

  // `create_communication_via_contact` is the requester's reply path — it is what
  // attributes the message to them rather than to an agent.
  async function send() {
    if (!canSend.value || sending.value) return
    sending.value = true
    try {
      await call('run_doc_method', {
        dt: 'HD Ticket',
        dn: ticket.data.name,
        method: 'create_communication_via_contact',
        args: { message: reply.value, attachments: attachments.value },
      })
      discard()
      ticket.fetch()
    } catch (error) {
      toast.error(error?.messages?.[0] || 'Could not send the message')
    } finally {
      sending.value = false
    }
  }

  return {
    canReply,
    composerOpen,
    openComposer,
    reply,
    setReply,
    attachments,
    addAttachment,
    removeAttachment,
    uploadArgs: UPLOAD_ARGS,
    canSend,
    sending,
    send,
    discard,
  }
}
