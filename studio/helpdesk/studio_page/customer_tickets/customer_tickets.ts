import { h, computed, ref } from 'vue'
import { useSettingsModal } from '@app/stores/settings'

// Customer-portal Tickets list view, rendered with frappe-ui ListView.
// Columns carry h() render functions so cells (status dot, badges, priority,
// avatar, rating) render natively without Studio slots.
// NOTE: unscoped (all tickets) for demo data — filter `tickets` by the
// logged-in contact/customer for a real portal.

const STATUS_COLOR = {
  Open: '#f59e0b', New: '#f59e0b',
  Replied: '#3b82f6', 'Awaiting Response': '#3b82f6',
  Resolved: '#22c55e', Closed: '#9ca3af',
}
const PRIORITY_COLOR = { Low: '#9ca3af', Medium: '#f59e0b', High: '#ef4444', Urgent: '#ef4444' }

export default function setup(context) {
  const { tickets } = context
  const navMenuOpen = ref(false)

  function firstAssignee(raw) {
    try {
      const list = JSON.parse(raw || '[]')
      return list[0] ? String(list[0]).split('@')[0] : ''
    } catch (e) {
      return ''
    }
  }
  function initials(name) {
    if (!name) return '—'
    return name.replace(/[._-]/g, ' ').split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
  }
  function remaining(dt) {
    if (!dt) return ''
    const diff = Math.floor((new Date(dt).getTime() - Date.now()) / 60000)
    if (diff <= 0) return 'Fulfilled'
    const hrs = Math.floor(diff / 60)
    const mins = diff % 60
    return hrs >= 24 ? `${Math.floor(hrs / 24)}d ${hrs % 24}h` : `${hrs}h ${mins}m`
  }

  const rows = computed(() => (tickets.data || []).map((t) => {
    const assignee = firstAssignee(t._assign)
    const filled = Math.round((t.feedback_rating || 0) * 5)
    return {
      name: t.name,
      id: '#' + t.name,
      subject: t.subject || '',
      status: t.status || '',
      statusColor: STATUS_COLOR[t.status] || '#9ca3af',
      firstDue: remaining(t.response_by),
      resolution: remaining(t.resolution_by),
      priority: t.priority || '',
      priorityColor: PRIORITY_COLOR[t.priority] || '#9ca3af',
      type: t.ticket_type || '',
      assignee,
      assigneeInitials: initials(assignee),
      team: t.agent_group || '',
      customer: t.customer || '',
      stars: [1, 2, 3, 4, 5].map((n) => n <= filled),
    }
  }))
  const totalCount = computed(() => tickets.data?.length || 0)

  // --- cell renderers ---
  const dot = (c) => h('div', { style: { width: '8px', height: '8px', borderRadius: '9999px', backgroundColor: c, flexShrink: 0 } })
  const badge = (txt) => txt
    ? h('span', { style: { padding: '2px 8px', borderRadius: '6px', backgroundColor: 'var(--surface-gray-2)', fontSize: '12px', color: 'var(--ink-gray-6)', whiteSpace: 'nowrap' } }, txt)
    : null
  const pribar = (c) => h('div', { style: { width: '3px', height: '12px', borderRadius: '2px', backgroundColor: c, flexShrink: 0 } })
  const avatar = (init) => h('div', { style: { width: '22px', height: '22px', borderRadius: '9999px', backgroundColor: 'var(--surface-gray-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'var(--ink-gray-7)', flexShrink: 0 } }, init)
  const starRow = (arr) => h('div', { style: { display: 'flex', gap: '1px' } }, arr.map((f) => h('span', { style: { color: f ? '#f59e0b' : '#d1d5db', fontSize: '13px', lineHeight: '1' } }, '★')))

  const columns = [
    { label: '', key: 'id', width: '64px', getLabel: ({ row }) => row.id },
    { label: '', key: 'subject', width: 4, getLabel: ({ row }) => row.subject },
    { label: 'Status', key: 'status', width: '130px', getLabel: ({ row }) => row.status, prefix: ({ row }) => dot(row.statusColor) },
    { label: 'First due', key: 'firstDue', width: '100px', getLabel: () => '', prefix: ({ row }) => badge(row.firstDue) },
    { label: 'Resolution', key: 'resolution', width: '100px', getLabel: () => '', prefix: ({ row }) => badge(row.resolution) },
    { label: 'Priority', key: 'priority', width: '100px', getLabel: ({ row }) => row.priority, prefix: ({ row }) => pribar(row.priorityColor) },
    { label: 'Type', key: 'type', width: '90px', getLabel: ({ row }) => row.type },
    { label: 'Assignee', key: 'assignee', width: '130px', getLabel: ({ row }) => row.assignee, prefix: ({ row }) => (row.assignee ? avatar(row.assigneeInitials) : null) },
    { label: 'Team', key: 'team', width: '100px', getLabel: ({ row }) => row.team },
    { label: 'Customer', key: 'customer', width: '120px', getLabel: ({ row }) => row.customer },
    { label: 'Rating', key: 'rating', width: '120px', getLabel: () => '', prefix: ({ row }) => starRow(row.stars) },
  ]

  const listOptions = {
    selectable: true,
    showTooltip: false,
    rowHeight: 44,
    onRowClick: (row) => { window.location.href = '/helpdesk/my-tickets/' + row.name },
  }

  return { navMenuOpen, rows, totalCount, columns, listOptions, ...useSettingsModal() }
}
