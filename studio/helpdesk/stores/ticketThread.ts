import { computed, ref, watch } from 'vue'
import { call, createResource, dayjs, toast } from 'frappe-ui'

// The message thread, the outside-working-hours banner and the reply composer —
// the data behind `desk/src/pages/ticket/TicketConversation.vue` and
// `TicketTextEditor.vue`. The page draws all of it from Studio blocks, so every
// value a block binds is finished here: no formatting is left to an expression.

const DATE_FORMAT = 'ddd, MMM D, YYYY h:mm A'
const UPLOAD_ARGS = { folder: 'Home/Helpdesk', private: true }

export function useTicketThread(ticket) {
  const conversation = computed(() => sortByCreation().map(toMessageRow))

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

  function toMessageRow(message, index: number, messages) {
    return {
      name: message.name,
      content: message.content,
      sender: message.user?.name || message.sender,
      image: message.user?.image,
      timeAgo: timeAgo(message.creation),
      fullDate: dayjs(message.creation).format(DATE_FORMAT),
      attachments: message.attachments || [],
      // The rail's line runs to the next avatar, so on the last one it stops short.
      railHeight: index === messages.length - 1 ? '20px' : '100%',
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
