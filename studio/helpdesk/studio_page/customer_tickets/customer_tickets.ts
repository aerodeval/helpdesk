import { computed, ref } from 'vue'
import { useListData, useListView } from '@framework/ui/ListView'
import {
  avatarCell, datetimeCell, idCell, priorityCell, ratingCell,
  resolutionCell, responseCell, statusCell, textCell,
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

// HD Ticket's own `customer_portal_columns` (helpdesk/doctype/hd_ticket.py),
// which is what the desk customer portal shows — labels, order and widths alike.
const DEFAULT_COLUMNS = [
  { fieldname: 'name', label: 'ID', width: '5rem' },
  { fieldname: 'subject', label: 'Subject', width: '22rem' },
  { fieldname: 'status', label: 'Status', width: '11rem' },
  { fieldname: 'priority', label: 'Priority', width: '10rem' },
  { fieldname: 'response_by', label: 'First response', width: '8rem' },
  { fieldname: 'resolution_by', label: 'Resolution', width: '8rem' },
  { fieldname: 'agent_group', label: 'Team', width: '10rem' },
  { fieldname: 'creation', label: 'Created', width: '8rem' },
]

// Assignee reads `_assign`, a standard field rather than a docfield. The column
// layer reserves `_`-prefixed keys for host-drawn ("synthetic") columns and drops
// any it has no declaration for, so it is declared here — see `fetchView` below
// for how its data still gets fetched.
const SYNTHETIC_COLUMNS = [{ key: '_assign', label: 'Assignee', width: '8rem' }]

// The SLA badges read fields no column shows: whether a first response landed,
// and when the ticket was resolved. The agent list gets them because
// `get_list_data` fetches a fixed row set; here they ride along as fetch-only keys.
const SUPPORT_FIELDS = ['first_responded_on', 'resolution_date']

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
    view.columns.wire.value.map((column) => ({
      ...column,
      cell: CELLS[column.key] || CELLS_BY_TYPE[column.type] || textCell,
    })),
  )

  const emptyState = computed(() => ({
    title: 'No tickets found',
    description: view.filters.conditions.value.length
      ? 'No tickets match the applied filters. Try adjusting or clearing them.'
      : 'Tickets you raise will show up here.',
  }))

  function openTicket(row) {
    window.location.href = '/helpdesk/my-tickets/' + row.name
  }

  return {
    ...useSettingsModal(),
    navMenuOpen: ref(false),
    // toolbar control state
    filters: view.filters.conditions,
    sort: view.sort.by,
    columns: view.columns.shown,
    // ColumnSettings offers its picker options from its own prop, not the composable.
    syntheticColumns: SYNTHETIC_COLUMNS,
    quickFilterFields: view.quickFilter.fields,
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
