"""Every 10 minutes, move all Seed Data forward by the time since the last move, so
"due in 25 min" and "2h ago" stay true all day. SLA dates move with everything else."""

from datetime import timedelta

import frappe
from frappe.utils import get_datetime, now_datetime

from helpdesk.demo import (
    TIMED_DOCTYPES,
    assert_seedable,
    datetime_columns,
    get_state,
    is_enabled,
    set_state,
)


def shift_dates() -> None:
    """Scheduler cron `*/10 * * * *`. The runner commits, so the shift is one transaction."""
    if is_enabled():
        DateShift().run()


class DateShift:
    def run(self):
        assert_seedable()
        anchor = get_datetime(get_state("anchor"))
        if not anchor:
            return
        # whole seconds keep the stored anchor exact, so shifts never drift
        seconds = int((now_datetime() - anchor).total_seconds())
        if seconds <= 0:
            return
        for doctype in TIMED_DOCTYPES:
            self.shift_table(doctype, seconds)
        self.recompute_date_fields()
        set_state("anchor", anchor + timedelta(seconds=seconds))
        for doctype in TIMED_DOCTYPES:
            frappe.clear_document_cache(doctype)

    def shift_table(self, doctype: str, seconds: int):
        assignments = ", ".join(
            f"`{c}` = `{c}` + INTERVAL %(seconds)s SECOND"
            for c in datetime_columns(doctype)
        )
        # Identifiers come from DocType meta; SQL cannot take them as parameters
        frappe.db.sql(  # nosemgrep: frappe-sql-format-injection
            f"UPDATE `tab{doctype}` SET {assignments}", {"seconds": seconds}
        )

    def recompute_date_fields(self):
        frappe.db.sql(
            "UPDATE `tabHD Ticket` SET opening_date = DATE(creation), opening_time = TIME(creation)"
        )
