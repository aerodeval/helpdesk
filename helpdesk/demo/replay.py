"""Full wipe and replay of the Seed Data.

Frappe's insert overwrites a preset `creation` with now (Document.set_user_and_timestamp,
outside install/migrate), so every insert runs at real time and is then re-stamped:
any datetime column written during that insert or event moves to its fixture time.
This backdates side rows too (Communication, ToDo, Version, Activity). SLA dates are
recomputed from the backdated `creation` once all tickets are in.
"""

from collections.abc import Callable
from contextlib import contextmanager
from datetime import datetime

import frappe
from frappe.utils import get_time, getdate, now_datetime

from helpdesk.demo import (
    TIMED_DOCTYPES,
    assert_seedable,
    datetime_columns,
    get_state,
    is_enabled,
    set_state,
)
from helpdesk.demo.fixture import FIXTURE_DIR, Fixture, is_offset, resolve_offset

# Rows that only exist because of tickets; None wipes the whole table
TICKET_ROWS = {
    "HD Ticket": None,
    "HD Ticket Comment": None,
    "HD Ticket Activity": None,
    "HD Notification": None,
    "Notification Log": None,
    "Communication": {"reference_doctype": "HD Ticket"},
    "ToDo": {"reference_type": "HD Ticket"},
    "Tag Link": {"document_type": "HD Ticket"},
}
PINNED_TARGETS = ("response_by", "resolution_by")
RECOMPUTED_FIELDS = (
    "opening_date",
    "opening_time",
    "service_level_agreement_creation",
    "response_by",
    "resolution_by",
    "first_response_time",
    "resolution_time",
    "first_response_failed_by",
    "resolution_failed_by",
    "agreement_status",
)


def reseed(fixture_path: str | None = None) -> None:
    """`bench --site <site> execute helpdesk.demo.replay.reseed`"""
    assert_seedable()
    Replay(Fixture(fixture_path or FIXTURE_DIR)).run()


def reseed_if_changed() -> None:
    """after_migrate: replay in a worker, since inserts behave differently in migrate."""
    if not is_enabled() or not (FIXTURE_DIR / "meta.json").exists():
        return
    if Fixture().seed_version == get_state("seed_version"):
        return
    frappe.enqueue(
        "helpdesk.demo.replay.reseed",
        queue="long",
        job_id="helpdesk_demo_reseed",
        deduplicate=True,
        enqueue_after_commit=True,
    )


class Replay:
    EVENTS: dict[str, Callable] = {
        "reply": lambda ticket, event: ticket.reply_via_agent(message=event["content"]),
        "customer_reply": lambda ticket, event: ticket.create_communication_via_contact(
            event["content"]
        ),
        "comment": lambda ticket, event: ticket.new_comment(event["content"]),
        "assign": lambda ticket, event: ticket.assign_agent(event["to"]),
        "update": lambda ticket, event: ticket.update(event["values"]).save(
            ignore_permissions=True
        ),
    }

    def __init__(self, fixture: Fixture):
        self.fixture = fixture
        self.records = fixture.records()
        self.anchor = now_datetime().replace(microsecond=0)
        self.pinned_targets: dict[str, dict] = {}

    def run(self):
        self.wipe()
        with self.seeding():
            for record in self.records:
                self.insert(dict(record))
            for ticket_name, pinned in self.pinned_targets.items():
                self.recompute_ticket_dates(ticket_name, pinned)
        self.set_site_flags()
        self.save_state()

    def wipe(self):
        doctypes = {record["doctype"] for record in self.records} - {"User"}
        for doctype in doctypes:
            delete_rows(doctype)
        for doctype, filters in TICKET_ROWS.items():
            delete_rows(doctype, filters)
        seeded = list(doctypes | set(TICKET_ROWS))
        delete_rows("Version", {"ref_doctype": ["in", seeded]})
        delete_rows("Comment", {"reference_doctype": ["in", seeded]})
        users = [r["email"] for r in self.records if r["doctype"] == "User"]
        if users:
            delete_rows("User", {"name": ["in", users]})

    @contextmanager
    def seeding(self):
        """Mute emails and let the write guard through while acting as fixture users."""
        user, mute_emails = frappe.session.user, frappe.flags.mute_emails
        frappe.flags.mute_emails = frappe.flags.in_demo_seed = True
        try:
            yield
        finally:
            frappe.flags.mute_emails, frappe.flags.in_demo_seed = mute_emails, False
            frappe.set_user(user)

    def insert(self, record: dict):
        creation = self.time(record.pop("creation", None))
        thread = record.pop("thread", [])
        pinned = {f: self.time(record.pop(f)) for f in PINNED_TARGETS if f in record}
        doc = frappe.get_doc(record)
        self.resolve_times(doc)
        self.at(creation, lambda: doc.insert(ignore_permissions=True))
        if doc.doctype == "HD Ticket":
            self.pinned_targets[doc.name] = pinned
            for event in thread:
                self.at(self.time(event["at"]), lambda e=event: self.apply(doc.name, e))

    def apply(self, ticket_name: str, event: dict):
        frappe.set_user(event.get("by", "Administrator"))
        ticket = frappe.get_doc("HD Ticket", ticket_name)
        self.EVENTS[event["type"]](ticket, event)
        frappe.set_user("Administrator")

    def at(self, moment: datetime | None, action: Callable):
        """Run `action`, then move every datetime it wrote to `moment`."""
        start = now_datetime()
        action()
        if moment:
            self.restamp(start, now_datetime(), moment)

    def restamp(self, start: datetime, end: datetime, moment: datetime):
        values = {"start": start, "end": end, "moment": moment}
        for doctype in TIMED_DOCTYPES:
            columns = datetime_columns(doctype)
            written = [f"`{c}` BETWEEN %(start)s AND %(end)s" for c in columns]
            assignments = ", ".join(
                f"`{c}` = IF({w}, %(moment)s, `{c}`)" for c, w in zip(columns, written)
            )
            # Identifiers come from DocType meta; SQL cannot take them as parameters
            frappe.db.sql(  # nosemgrep: frappe-sql-format-injection
                f"UPDATE `tab{doctype}` SET {assignments} WHERE {' OR '.join(written)}",
                values,
            )

    def recompute_ticket_dates(self, ticket_name: str, pinned: dict):
        """SLA targets were computed from the real insert time; redo them from `creation`."""
        ticket = frappe.get_doc("HD Ticket", ticket_name)
        ticket.service_level_agreement_creation = ticket.creation
        ticket.opening_date = getdate(ticket.creation)
        ticket.opening_time = get_time(ticket.creation)
        if sla := ticket.get_sla():
            sla.handle_targets(ticket)
            ticket.update(pinned)
            sla.set_first_response_time(ticket)
            sla.set_resolution_time(ticket)
            sla.set_failed_by(ticket)
            sla.handle_agreement_status(ticket)
        values = {f: ticket.get(f) for f in RECOMPUTED_FIELDS}
        frappe.db.set_value("HD Ticket", ticket_name, values, update_modified=False)

    def resolve_times(self, doc):
        for row in [doc, *doc.get_all_children()]:
            for df in row.meta.fields:
                value = row.get(df.fieldname)
                if df.fieldtype in ("Date", "Datetime") and is_offset(value):
                    moment = resolve_offset(value, self.anchor)
                    row.set(
                        df.fieldname,
                        moment.date() if df.fieldtype == "Date" else moment,
                    )

    def time(self, offset: str | None) -> datetime | None:
        return resolve_offset(offset, self.anchor) if offset else None

    def set_site_flags(self):
        frappe.db.set_single_value(
            "HD Settings", {"setup_complete": 1, "persona_captured": 1}
        )

    def save_state(self):
        max_ticket = frappe.db.sql(
            "select max(cast(name as unsigned)) from `tabHD Ticket`"
        )[0][0]
        set_state("seed_version", self.fixture.seed_version)
        set_state("anchor", self.anchor)
        set_state("max_ticket", max_ticket or 0)
        for persona in ("agent", "customer"):
            set_state(persona, self.fixture.personas.get(persona, ""))


def delete_rows(doctype: str, filters: dict | None = None):
    """Raw delete, child tables included, so a re-inserted parent never inherits old rows."""
    names = frappe.get_all(doctype, filters, pluck="name") if filters else None
    if names == []:
        return
    parent_filter = {"parent": ["in", names]} if names else {}
    for table in frappe.get_meta(doctype).get_table_fields():
        frappe.db.delete(table.options, {"parenttype": doctype, **parent_filter})
    frappe.db.delete(doctype, filters)
