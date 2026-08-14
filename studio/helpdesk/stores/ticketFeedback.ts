import { computed, ref, watch } from 'vue'
import { call, createListResource, toast } from 'frappe-ui'

// The rating asked for before a ticket closes, when the helpdesk requires one —
// a port of `desk/src/pages/ticket/TicketFeedback.vue`, down to the rating-scoped
// option list and the single `set_value` that saves the feedback and the status
// together. The dialog itself is built from Studio blocks; this is its state.

export function useTicketFeedback(ticket) {
  const feedbackOpen = ref(false)
  // In stars, the way the Rating component counts; HD Ticket stores a fraction.
  const feedbackStars = ref(0)
  const feedbackOption = ref<string | null>(null)
  const feedbackText = ref('')
  const feedbackSaving = ref(false)

  const options = createListResource({
    doctype: 'HD Ticket Feedback Option',
    fields: ['name', 'label'],
    pageLength: 99999,
  })

  const feedbackOptions = computed(() =>
    (options.data || []).map((option) => ({
      ...option,
      theme: feedbackOption.value === option.name ? 'blue' : 'gray',
    })),
  )

  // A different rating means a different option set, so the previous answer goes.
  watch(feedbackStars, (stars) => {
    feedbackOption.value = null
    feedbackText.value = ''
    options.update({ filters: { rating: stars / 5, disabled: 0 } })
    options.reload()
  })

  watch(feedbackOpen, (open) => {
    if (open) return
    feedbackStars.value = 0
    feedbackOption.value = null
    feedbackText.value = ''
  })

  function openFeedback() {
    feedbackOpen.value = true
  }

  function closeFeedback() {
    feedbackOpen.value = false
  }

  function selectFeedbackOption(name: string) {
    feedbackOption.value = name
  }

  // One write, exactly as the desk does it: the status rides along with the
  // feedback, so a ticket is never closed without the rating that was asked for.
  async function submitFeedback() {
    if (!feedbackOption.value || feedbackSaving.value) return
    feedbackSaving.value = true
    try {
      await call('frappe.client.set_value', {
        doctype: 'HD Ticket',
        name: ticket.data.name,
        fieldname: {
          status: 'Closed',
          feedback: feedbackOption.value,
          feedback_extra: feedbackText.value,
        },
      })
      closeFeedback()
      ticket.fetch()
    } catch (error) {
      toast.error(error?.messages?.[0] || 'Could not save the feedback')
    } finally {
      feedbackSaving.value = false
    }
  }

  return {
    feedbackOpen,
    openFeedback,
    closeFeedback,
    feedbackStars,
    feedbackOptions,
    feedbackOption,
    selectFeedbackOption,
    feedbackText,
    feedbackSaving,
    canSubmitFeedback: computed(() => Boolean(feedbackOption.value)),
    submitFeedback,
  }
}
