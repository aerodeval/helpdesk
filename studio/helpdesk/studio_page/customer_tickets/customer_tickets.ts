import { computed, ref } from 'vue'
import { useListData, useListView } from '@framework/ui/ListView'
import {
  avatarCell, datetimeCell, idCell, priorityCell, ratingCell,
  resolutionCell, responseCell, statusCell, subjectCell, textCell,
} from '@app/components/ticketCells'
import { useSettingsModal } from '@app/stores/settings'

// Customer-portal Tickets list. Filters, sort, columns and the fetch come from
// @framework/ui's list composables; the columns and cells mirror the agent
// portal's list (HD Ticket's `default_list_data` + Tickets.vue) so the two read
// as one design.
// NOTE: unscoped (all tickets) for demo data — filter by the logged-in
// contact/customer for a real portal.

const DOCTYPE = 'HD Ticket'
const PAGE_LENGTHS = [20, 50, 100]

// HD Ticket's own `default_list_data` (helpdesk/doctype/hd_ticket.py), which is
// what the agent portal's ticket list shows — labels, order and widths alike.
const DEFAULT_COLUMNS = [
  { fieldname: 'name', label: 'ID', width: 'auto' },
  { fieldname: 'subject', label: 'Subject', width: '25rem' },
  { fieldname: 'status', label: 'Status', width: '8rem' },
  { fieldname: 'response_by', label: 'First Response', width: '8rem' },
  { fieldname: 'resolution_by', label: 'Resolution', width: '8rem' },
  { fieldname: '_assign', label: 'Assigned To', width: '8rem' },
  { fieldname: 'customer', label: 'Customer', width: '8rem' },
  { fieldname: 'priority', label: 'Priority', width: '10rem' },
  { fieldname: 'ticket_type', label: 'Type', width: '11rem' },
  { fieldname: 'agent_group', label: 'Team', width: '10rem' },
  { fieldname: 'contact', label: 'Contact', width: '8rem' },
  { fieldname: 'feedback_rating', label: 'Rating', width: '10rem' },
  { fieldname: 'creation', label: 'Created', width: '8rem' },
]

// Assignee reads `_assign`, a standard field rather than a docfield. The column
// layer reserves `_`-prefixed keys for host-drawn ("synthetic") columns and drops
// any it has no declaration for, so it is declared here — see `fetchView` below
// for how its data still gets fetched.
const SYNTHETIC_COLUMNS = [{ key: '_assign', label: 'Assigned To', width: '8rem' }]

// Fields no column shows: whether a first response landed and when the ticket was
// resolved (the SLA badges), plus who has opened it (the subject's unread weight).
// The agent list gets them because `get_list_data` fetches a fixed row set; here
// they ride along as fetch-only keys.
const SUPPORT_FIELDS = ['first_responded_on', 'resolution_date', '_seen']

// Keyed by fieldname, then by column type — the same order `listCell` resolves in.
// `creation`/`modified` are keyed rather than left to the type fallback: neither is
// a docfield, so the column layer has no Meta to call them Datetime with.
const CELLS = {
  name: idCell,
  status: statusCell,
  priority: priorityCell,
  response_by: responseCell,
  resolution_by: resolutionCell,
  creation: datetimeCell,
  modified: datetimeCell,
  _assign: avatarCell,
  feedback_rating: ratingCell,
}
const CELLS_BY_TYPE = { Datetime: datetimeCell, Date: datetimeCell, Rating: ratingCell }

export default function setup(context) {
  // Loaded up front: the organization switcher lists them, and the subject cell
  // needs the reader's email to know which tickets are unread.
  const settings = useSettingsModal(context)
  settings.loadSettings()

  const view = useListView(DOCTYPE, { synthetic: SYNTHETIC_COLUMNS })
  // Seeded before the data layer: `useListData` fetches off the wire columns the
  // moment it is created, so seeding after would spend a request on the defaults.
  view.columns.shown.value = DEFAULT_COLUMNS

  // The fetch skips a synthetic column's key, since normally the host fetches that
  // data itself. `_assign` needs no such help — it is a real column to `get_list` —
  // so the data layer gets the same view with the declarations hidden, plus the
  // support fields appended so they are requested without ever being a column.
  const fetchView = {
    ...view,
    columns: {
      ...view.columns,
      synthetic: computed(() => []),
      wire: computed(() => [
        ...view.columns.wire.value,
        ...SUPPORT_FIELDS.map((key) => ({ key })),
      ]),
    },
  }
  const data = useListData(DOCTYPE, fetchView)

  const listColumns = computed(() =>
    view.columns.wire.value.map((column) => ({ ...column, cell: cellFor(column) })),
  )

  function cellFor(column) {
    // Subject alone needs context beyond the row: who is reading. `_seen` holds
    // User docnames, not emails.
    if (column.key === 'subject')
      return (props) => subjectCell(props, settings.settingsUser.value.name)
    return CELLS[column.key] || CELLS_BY_TYPE[column.type] || textCell
  }

  const emptyState = computed(() => ({
    title: 'No tickets found',
    description: view.filters.conditions.value.length
      ? 'No tickets match the applied filters. Try adjusting or clearing them.'
      : 'Tickets you raise will show up here.',
  }))

  function openTicket(row) {
    window.location.href = '/helpdesk/my-tickets/' + row.name
  }

  // --- Organization switcher ---

  // The switcher is a view of the `customer` condition, not state beside it: clear
  // that condition from the Filter panel and the switcher follows.
  const activeOrganization = computed(() => {
    const condition = view.filters.conditions.value.find(isCustomerCondition)
    return typeof condition?.value === 'string' ? condition.value : ''
  })

  function selectOrganization(customer) {
    const others = view.filters.conditions.value.filter((c) => !isCustomerCondition(c))
    view.filters.conditions.value = customer
      ? [...others, { fieldname: 'customer', operator: 'equals', value: customer }]
      : others
  }

  function isCustomerCondition(condition) {
    return condition.fieldname === 'customer' && condition.operator === 'equals'
  }

  // Customer is in `in_standard_filter`, so it arrives as a quick filter — but the
  // switcher is that filter here. Writable so customize mode still writes back.
  const quickFilterFields = computed({
    get: () => view.quickFilter.fields.value.filter((f) => f.fieldname !== 'customer'),
    set: (fields) => (view.quickFilter.fields.value = fields),
  })

  return {
    ...settings,
    navMenuOpen: ref(false),
    // toolbar control state
    activeOrganization,
    selectOrganization,
    filters: view.filters.conditions,
    sort: view.sort.by,
    columns: view.columns.shown,
    // ColumnSettings offers its picker options from its own prop, not the composable.
    syntheticColumns: SYNTHETIC_COLUMNS,
    quickFilterFields,
    quickFilterCustomizing: view.quickFilter.customizing,
    // table + footer
    listColumns,
    emptyState,
    openTicket,
    rows: data.rows,
    listLoading: data.loading,
    rowCount: data.rowCount,
    totalCount: data.totalCount,
    pageLength: data.pageLength,
    pageLengthOptions: PAGE_LENGTHS,
    loadMore: data.loadMore,
    reload: data.reload,
    resizeColumn: ({ key, width }) => view.columns.setWidth(key, width),
  }
}
