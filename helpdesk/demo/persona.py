"""Visitor access: persona auto-login, the server write guard, boot keys and noindex."""

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import cint

from helpdesk.demo import get_state, is_enabled
from helpdesk.helpdesk.doctype.hd_service_level_agreement.utils import get_sla

# What the interceptor mirrors from HD Settings. Customers cannot read it, so it rides in the boot.
SETTINGS_FIELDS = (
    "auto_update_status",
    "update_status_to",
    "ticket_reopen_status",
    "default_ticket_status",
    "default_priority",
)

# Framework logs a signed-in session writes on its own, even when it only reads
LOG_DOCTYPES = {
    "Activity Log",
    "Access Log",
    "View Log",
    "Route History",
    "Error Log",
    "Notification Settings",
    "Web Page View",
}


@frappe.whitelist(allow_guest=True, methods=["GET"])
@rate_limit(limit=60, seconds=60 * 60)
def login_as_agent() -> None:
    login_as_persona("agent", "/helpdesk")


@frappe.whitelist(allow_guest=True, methods=["GET"])
@rate_limit(limit=60, seconds=60 * 60)
def login_as_customer() -> None:
    login_as_persona("customer", "/help")


def login_as_persona(persona: str, route: str):
    user = is_enabled() and get_state(persona)
    if not user:
        frappe.throw(_("Not found"), frappe.DoesNotExistError)
    frappe.local.login_manager.login_as(user)
    frappe.local.response["type"] = "redirect"
    frappe.local.response["location"] = route


def is_guarded_persona(user: str) -> bool:
    return (
        is_enabled()
        and not frappe.flags.in_demo_seed
        and user in (get_state("agent"), get_state("customer"))
    )


def reject_persona_write(doc, method=None, *args, **kwargs):
    """doc_events on every doctype. Raw `frappe.db.set_value` writes, such as
    `add_seen` on a ticket read, fire no doc event and pass."""
    if doc.doctype in LOG_DOCTYPES or not is_guarded_persona(frappe.session.user):
        return
    frappe.throw(_("This is a read-only demo."), frappe.PermissionError)


def block_password_change(doc, method=None):
    if doc.get("new_password") and is_guarded_persona(doc.name):
        frappe.throw(
            _("The demo user's password cannot be changed."), frappe.PermissionError
        )


def block_password_reset(doc, method=None):
    if is_guarded_persona(doc.name):
        frappe.throw(
            _("The demo user's password cannot be reset."), frappe.PermissionError
        )


def get_boot() -> dict | None:
    if not is_enabled():
        return None
    return {
        "seed_version": get_state("seed_version"),
        "max_ticket": cint(get_state("max_ticket")),
        "settings": frappe.get_cached_value(
            "HD Settings", "HD Settings", SETTINGS_FIELDS, as_dict=True
        ),
        "slas": get_sla_priorities(),
        "customer_slas": get_customer_slas(),
    }


def get_sla_priorities() -> dict[str, list[dict]]:
    """Response and resolution seconds per SLA and priority: a new ticket's due dates."""
    slas = {}
    for row in frappe.get_all(
        "HD Service Level Priority",
        filters={"parenttype": "HD Service Level Agreement"},
        fields=["parent", "priority", "response_time", "resolution_time"],
    ):
        slas.setdefault(row.pop("parent"), []).append(row)
    return slas


def get_customer_slas() -> dict[str, str | None]:
    """The SLA a new ticket of each customer gets; "" for a ticket with no customer.
    SLA conditions are Python, so each is run against an unsaved ticket."""
    customers = ["", *frappe.get_all("HD Customer", pluck="name")]
    return {
        customer: (sla := get_sla(frappe.new_doc("HD Ticket", customer=customer)))
        and sla.name
        for customer in customers
    }


def add_noindex_header(response, request):
    if is_enabled():
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
