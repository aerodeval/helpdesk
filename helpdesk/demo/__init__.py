"""Live demo backend. Every entry point does nothing unless site_config has `helpdesk_demo: 1`.

Seed state lives in site defaults (`frappe.db.set_default`), so it survives cache clears:
`demo_seed_version`, `demo_anchor`, `demo_max_ticket`, `demo_agent`, `demo_customer`.
"""

import frappe
from frappe import _

from helpdesk.setup.welcome_ticket import AUTHOR_EMAIl

# Doctypes whose datetime columns are re-stamped by the replay and moved by the date-shift
TIMED_DOCTYPES = (
    "HD Ticket",
    "HD Ticket Comment",
    "HD Ticket Activity",
    "HD Notification",
    "Communication",
    "ToDo",
    "Version",
    "Comment",
    "Notification Log",
    "HD Article",
    "HD Article Category",
    "HD Saved Reply",
    "HD Customer",
    "Contact",
    "HD Agent",
    "User",
)


def is_enabled() -> bool:
    return bool(frappe.conf.get("helpdesk_demo"))


def get_state(key: str) -> str | None:
    return frappe.db.get_default(f"demo_{key}")


def set_state(key: str, value) -> None:
    frappe.db.set_default(f"demo_{key}", str(value))


def assert_seedable() -> None:
    """Replay and date-shift rewrite every ticket, so they run only on a site that is
    flagged as a demo and holds no tickets other than seeded ones or the install's
    welcome ticket."""
    if not is_enabled():
        frappe.throw(_("Not a demo site: site_config has no `helpdesk_demo: 1`."))
    if not get_state("seed_version") and has_real_tickets():
        frappe.throw(
            _("Refusing to touch a site that has tickets but was never seeded.")
        )


def has_real_tickets() -> bool:
    # the ticket install creates (helpdesk/setup/welcome_ticket.py)
    welcome = {"subject": "Welcome to Helpdesk", "raised_by": AUTHOR_EMAIl}
    return frappe.db.count("HD Ticket") > frappe.db.count("HD Ticket", welcome)


def datetime_columns(doctype: str) -> list[str]:
    meta = frappe.get_meta(doctype)
    fields = [
        df.fieldname
        for df in meta.fields
        if df.fieldtype == "Datetime" and not df.is_virtual
    ]
    return ["creation", "modified", *fields]
