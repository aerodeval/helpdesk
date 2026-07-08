import { t as e } from "./settings-MvlymeDD.js";
import { P as t, h as n, l as r, w as i } from "./studioRenderer-Dce1CqVj.js";
var a = {
    Open: `#f59e0b`,
    New: `#f59e0b`,
    Replied: `#3b82f6`,
    "Awaiting Response": `#3b82f6`,
    Resolved: `#22c55e`,
    Closed: `#9ca3af`,
  },
  o = { Low: `#9ca3af`, Medium: `#f59e0b`, High: `#ef4444`, Urgent: `#ef4444` };
function s(s) {
  let { tickets: c } = s,
    l = t(!1);
  function u(e) {
    try {
      let t = JSON.parse(e || `[]`);
      return t[0] ? String(t[0]).split(`@`)[0] : ``;
    } catch (e) {
      return ``;
    }
  }
  function d(e) {
    return e
      ? e
          .replace(/[._-]/g, ` `)
          .split(` `)
          .filter(Boolean)
          .slice(0, 2)
          .map((e) => e[0].toUpperCase())
          .join(``)
      : `—`;
  }
  function f(e) {
    if (!e) return ``;
    let t = Math.floor((new Date(e).getTime() - Date.now()) / 6e4);
    if (t <= 0) return `Fulfilled`;
    let n = Math.floor(t / 60),
      r = t % 60;
    return n >= 24 ? `${Math.floor(n / 24)}d ${n % 24}h` : `${n}h ${r}m`;
  }
  let p = n(() =>
      (c.data || []).map((e) => {
        let t = u(e._assign),
          n = Math.round((e.feedback_rating || 0) * 5);
        return {
          name: e.name,
          id: `#` + e.name,
          subject: e.subject || ``,
          status: e.status || ``,
          statusColor: a[e.status] || `#9ca3af`,
          firstDue: f(e.response_by),
          resolution: f(e.resolution_by),
          priority: e.priority || ``,
          priorityColor: o[e.priority] || `#9ca3af`,
          type: e.ticket_type || ``,
          assignee: t,
          assigneeInitials: d(t),
          team: e.agent_group || ``,
          customer: e.customer || ``,
          stars: [1, 2, 3, 4, 5].map((e) => e <= n),
        };
      })
    ),
    m = n(() => {
      var e;
      return ((e = c.data) == null ? void 0 : e.length) || 0;
    }),
    h = (e) =>
      i(`div`, {
        style: {
          width: `8px`,
          height: `8px`,
          borderRadius: `9999px`,
          backgroundColor: e,
          flexShrink: 0,
        },
      }),
    g = (e) =>
      e
        ? i(
            `span`,
            {
              style: {
                padding: `2px 8px`,
                borderRadius: `6px`,
                backgroundColor: `var(--surface-gray-2)`,
                fontSize: `12px`,
                color: `var(--ink-gray-6)`,
                whiteSpace: `nowrap`,
              },
            },
            e
          )
        : null,
    _ = (e) =>
      i(`div`, {
        style: {
          width: `3px`,
          height: `12px`,
          borderRadius: `2px`,
          backgroundColor: e,
          flexShrink: 0,
        },
      }),
    v = (e) =>
      i(
        `div`,
        {
          style: {
            width: `22px`,
            height: `22px`,
            borderRadius: `9999px`,
            backgroundColor: `var(--surface-gray-3)`,
            display: `flex`,
            alignItems: `center`,
            justifyContent: `center`,
            fontSize: `11px`,
            color: `var(--ink-gray-7)`,
            flexShrink: 0,
          },
        },
        e
      ),
    y = (e) =>
      i(
        `div`,
        { style: { display: `flex`, gap: `1px` } },
        e.map((e) =>
          i(
            `span`,
            {
              style: {
                color: e ? `#f59e0b` : `#d1d5db`,
                fontSize: `13px`,
                lineHeight: `1`,
              },
            },
            `★`
          )
        )
      );
  return r(
    {
      navMenuOpen: l,
      rows: p,
      totalCount: m,
      columns: [
        { label: ``, key: `id`, width: `64px`, getLabel: ({ row: e }) => e.id },
        {
          label: ``,
          key: `subject`,
          width: 4,
          getLabel: ({ row: e }) => e.subject,
        },
        {
          label: `Status`,
          key: `status`,
          width: `130px`,
          getLabel: ({ row: e }) => e.status,
          prefix: ({ row: e }) => h(e.statusColor),
        },
        {
          label: `First due`,
          key: `firstDue`,
          width: `100px`,
          getLabel: () => ``,
          prefix: ({ row: e }) => g(e.firstDue),
        },
        {
          label: `Resolution`,
          key: `resolution`,
          width: `100px`,
          getLabel: () => ``,
          prefix: ({ row: e }) => g(e.resolution),
        },
        {
          label: `Priority`,
          key: `priority`,
          width: `100px`,
          getLabel: ({ row: e }) => e.priority,
          prefix: ({ row: e }) => _(e.priorityColor),
        },
        {
          label: `Type`,
          key: `type`,
          width: `90px`,
          getLabel: ({ row: e }) => e.type,
        },
        {
          label: `Assignee`,
          key: `assignee`,
          width: `130px`,
          getLabel: ({ row: e }) => e.assignee,
          prefix: ({ row: e }) => (e.assignee ? v(e.assigneeInitials) : null),
        },
        {
          label: `Team`,
          key: `team`,
          width: `100px`,
          getLabel: ({ row: e }) => e.team,
        },
        {
          label: `Customer`,
          key: `customer`,
          width: `120px`,
          getLabel: ({ row: e }) => e.customer,
        },
        {
          label: `Rating`,
          key: `rating`,
          width: `120px`,
          getLabel: () => ``,
          prefix: ({ row: e }) => y(e.stars),
        },
      ],
      listOptions: {
        selectable: !0,
        showTooltip: !1,
        rowHeight: 44,
        onRowClick: (e) => {
          window.location.href = `/helpdesk/my-tickets/` + e.name;
        },
      },
    },
    e()
  );
}
export { s as default };
//# sourceMappingURL=customer_tickets-CwXa9RmS.js.map
