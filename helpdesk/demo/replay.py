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
from pathlib import Path

import frappe
from frappe.cache_manager import clear_doctype_map
from frappe.core.doctype.file.utils import get_content_hash
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
# HD Ticket names come from the `.####` autoname, whose series key is empty
TICKET_SERIES = ""
PINNED_TARGETS = ("response_by", "resolution_by")
# Fixture images live in the app's public/demo; they are published as site files
IMAGE_FIELDS = ("user_image", "brand_logo", "favicon")
ASSET_PREFIX = "/assets/helpdesk/demo/"
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
        "customer_reply": lambda ticket, event: reply_as_contact(ticket, event),
        "comment": lambda ticket, event: ticket.new_comment(event["content"]),
        "assign": lambda ticket, event: ticket.assign_agent(event["to"]),
        "update": lambda ticket, event: update_ticket(ticket, event["values"]),
    }

    def __init__(self, fixture: Fixture):
        self.fixture = fixture
        self.records = fixture.records()
        self.anchor = now_datetime().replace(microsecond=0)
        self.pinned_targets: dict[str, dict] = {}
        # category title -> name; HD Article Category is hash-named
        self.categories: dict[str, str] = {}

    def run(self):
        self.wipe()
        with self.seeding():
            # before the inserts: status and SLA defaults shape how tickets are handled
            self.apply_settings()
            tickets = [r for r in self.records if r["doctype"] == "HD Ticket"]
            for record in self.records:
                if record["doctype"] != "HD Ticket":
                    self.insert(dict(record))
            with without_auto_assignment():
                for record in tickets:
                    self.insert(dict(record))
            for ticket_name, pinned in self.pinned_targets.items():
                self.recompute_ticket_dates(ticket_name, pinned)
        self.save_state()

    def wipe(self):
        doctypes = {record["doctype"] for record in self.records} - {"User"}
        # each team made its own round-robin rule; the re-inserted team makes another
        rules = frappe.get_all("HD Team", pluck="assignment_rule")
        delete_rows("Assignment Rule", {"name": ["in", [r for r in rules if r]]})
        for doctype in doctypes:
            delete_rows(doctype)
        for doctype, filters in TICKET_ROWS.items():
            delete_rows(doctype, filters)
        # numbers restart at 1, or each replay would carry on from the last one
        series = frappe.qb.DocType("Series")
        frappe.qb.update(series).set(series.current, 0).where(
            series.name == TICKET_SERIES
        ).run()
        seeded = list(doctypes | set(TICKET_ROWS))
        delete_rows("Version", {"ref_doctype": ["in", seeded]})
        delete_rows("Comment", {"reference_doctype": ["in", seeded]})
        users = [r["email"] for r in self.records if r["doctype"] == "User"]
        if users:
            delete_rows("User", {"name": ["in", users]})

    @contextmanager
    def seeding(self):
        """Mute emails, lift the signup throttle and let the write guard through while
        acting as fixture users."""
        user, mute_emails = frappe.session.user, frappe.flags.mute_emails
        throttle = frappe.conf.get("throttle_user_limit")
        frappe.flags.mute_emails = frappe.flags.in_demo_seed = True
        # a fixture inserts more users in a minute than the signup throttle allows
        frappe.conf.throttle_user_limit = float("inf")
        try:
            yield
        finally:
            frappe.flags.mute_emails, frappe.flags.in_demo_seed = mute_emails, False
            if throttle is None:
                frappe.conf.pop("throttle_user_limit", None)
            else:
                frappe.conf.throttle_user_limit = throttle
            frappe.set_user(user)

    def insert(self, record: dict):
        creation = self.time(record.pop("creation", None))
        thread = record.pop("thread", [])
        pinned = {f: self.time(record.pop(f)) for f in PINNED_TARGETS if f in record}
        record.update(publish_images(record))
        if record["doctype"] == "HD Article" and record.get("category"):
            record["category"] = self.categories[record["category"]]
        doc = frappe.get_doc(record)
        self.resolve_times(doc)
        self.at(creation, lambda: self.create(doc))
        if doc.doctype == "HD Article Category":
            self.categories[doc.category_name] = doc.name
        if doc.doctype == "HD Ticket":
            self.pinned_targets[doc.name] = pinned
            for event in thread:
                self.at(self.time(event["at"]), lambda e=event: self.apply(doc.name, e))

    def create(self, doc):
        if doc.doctype == "HD Ticket":
            return self.create_ticket(doc)
        # an article's author is whoever inserts it
        with acting_as(doc.author if doc.doctype == "HD Article" else None):
            doc.insert(ignore_permissions=True)

    def create_ticket(self, ticket):
        """Insert blank, as email intake does: inserted as the customer, the portal
        rules would reset the agent-set fields. Then the customer sends the first
        message, which fills the description."""
        message, ticket.description = ticket.description, None
        ticket.insert(ignore_permissions=True)
        frappe.db.set_value(
            "HD Ticket", ticket.name, "owner", ticket.raised_by, update_modified=False
        )
        with acting_as(ticket.raised_by):
            ticket.create_communication_via_contact(message, new_ticket=True)

    def apply(self, ticket_name: str, event: dict):
        with acting_as(event.get("by")):
            ticket = frappe.get_doc("HD Ticket", ticket_name)
            self.EVENTS[event["type"]](ticket, event)

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

    def apply_settings(self):
        settings = frappe.get_single("HD Settings")
        settings.update(self.fixture.settings)
        settings.update(publish_images(self.fixture.settings))
        settings.update({"setup_complete": 1, "persona_captured": 1})
        settings.save(ignore_permissions=True)

    def save_state(self):
        max_ticket = frappe.db.sql(
            "select max(cast(name as unsigned)) from `tabHD Ticket`"
        )[0][0]
        set_state("seed_version", self.fixture.seed_version)
        set_state("anchor", self.anchor)
        set_state("max_ticket", max_ticket or 0)
        for persona in ("agent", "customer"):
            set_state(persona, self.fixture.personas.get(persona, ""))


def publish_images(values: dict) -> dict:
    """`/assets` resolves only where the bench built this app's assets. A public File
    serves from the site itself, as an uploaded avatar does."""
    return {
        field: publish_image(values[field])
        for field in IMAGE_FIELDS
        if str(values.get(field) or "").startswith(ASSET_PREFIX)
    }


def publish_image(asset_url: str) -> str:
    file_name = asset_url.removeprefix(ASSET_PREFIX)
    path = Path(frappe.get_app_path("helpdesk", "public", "demo", file_name))
    content = path.read_bytes()
    existing = frappe.db.get_value(
        "File", {"content_hash": get_content_hash(content), "is_private": 0}, "file_url"
    )
    if existing:
        return existing
    file = frappe.get_doc(
        {"doctype": "File", "file_name": file_name, "content": content, "is_private": 0}
    )
    return file.insert(ignore_permissions=True).file_url


def reply_as_contact(ticket, event: dict):
    if frappe.has_permission("HD Ticket", "write", ticket):
        return ticket.create_communication_via_contact(event["content"])
    # a colleague of the contact cannot open the ticket; their reply arrives by email
    with acting_as("Administrator"):
        frappe.get_doc(
            {
                "doctype": "Communication",
                "communication_medium": "Email",
                "sent_or_received": "Received",
                "sender": event["by"],
                "subject": f"Re: {ticket.subject}",
                "content": event["content"],
                "reference_doctype": "HD Ticket",
                "reference_name": ticket.name,
                "status": "Linked",
            }
        ).insert(ignore_permissions=True)


def update_ticket(ticket, values: dict):
    # a closed ticket is rated through the link in its closing email
    ticket.flags.ignore_closed_ticket_guard = "feedback" in values
    ticket.update(values).save(ignore_permissions=True)


@contextmanager
def without_auto_assignment():
    """The fixture's `assign` events say who owns each ticket; round-robin rules
    would add an assignee to every ticket they match."""
    rules = frappe.get_all(
        "Assignment Rule", {"document_type": "HD Ticket", "disabled": 0}, pluck="name"
    )
    set_disabled(rules, 1)
    try:
        yield
    finally:
        set_disabled(rules, 0)


def set_disabled(rules: list[str], disabled: int):
    for rule in rules:
        frappe.db.set_value(
            "Assignment Rule", rule, "disabled", disabled, update_modified=False
        )
    clear_doctype_map("Assignment Rule", "HD Ticket")


@contextmanager
def acting_as(user: str | None):
    """Run as `user`, or as the current user when None."""
    previous = frappe.session.user
    if user:
        frappe.set_user(user)
    try:
        yield
    finally:
        if user:
            frappe.set_user(previous)


def delete_rows(doctype: str, filters: dict | None = None):
    """Raw delete, child tables included, so a re-inserted parent never inherits old rows."""
    names = frappe.get_all(doctype, filters, pluck="name") if filters else None
    if names == []:
        return
    parent_filter = {"parent": ["in", names]} if names else {}
    for table in frappe.get_meta(doctype).get_table_fields():
        frappe.db.delete(table.options, {"parenttype": doctype, **parent_filter})
    frappe.db.delete(doctype, filters)
