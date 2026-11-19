import frappe
from frappe import _

from helpdesk.consts import (
    ONBOARDING_STEPS,
    SETUP_CHECKLIST_STEPS,
    WELCOME_TICKET_SUBJECT,
)


@frappe.whitelist()
def get_first_ticket(ticket: str | None = None):
    """Get first ticket created except the default ticket"""
    # If a cached ticket ID was passed, verify it still exists
    if ticket and frappe.db.exists("HD Ticket", ticket):
        return ticket

    result = frappe.get_all(
        "HD Ticket",
        filters={
            "subject": ["!=", WELCOME_TICKET_SUBJECT],
            "owner": ["=", frappe.session.user],
        },
        fields=["name"],
        order_by="creation asc",
        limit=1,
    )
    return result[0].name if result else None


@frappe.whitelist()
def get_general_category_id():
    """Get the id of the general category"""
    category = frappe.get_all(
        "HD Article Category",
        filters={"category_name": ["=", "General"]},
        pluck="name",
        order_by="creation asc",
        limit=1,
    )
    return category[0] if category else None


@frappe.whitelist(methods=["GET"])
def get_setup_status() -> dict:
    """What the first-run setup page polls: the connected mailbox, the first ticket it
    brought in, and whether the admin still needs a password. System Managers only."""
    from frappe.core.doctype.user.user import needs_password_setup

    frappe.only_for("System Manager")
    mailboxes = frappe.get_all(
        "Email Account", filters={"enable_incoming": 1}, fields=["name", "email_id"]
    )
    return {
        "email_connected": bool(mailboxes),
        "email_address": mailboxes[0].email_id if mailboxes else None,
        "first_ticket": get_first_mailbox_ticket([m.name for m in mailboxes]),
        "needs_password": needs_password_setup(),
    }


def get_first_mailbox_ticket(mailboxes: list[str]) -> dict | None:
    """The first ticket a connected mailbox brought in. The welcome and agent-made
    tickets have no email account, and the poll skips the scan when nothing is connected.
    """
    if not mailboxes:
        return None
    ticket = frappe.get_list(
        "Communication",
        filters={
            "reference_doctype": "HD Ticket",
            "sent_or_received": "Received",
            "email_account": ["in", mailboxes],
        },
        order_by="creation asc",
        limit=1,
        pluck="reference_name",
    )
    if not ticket:
        return None
    return frappe.db.get_value(
        "HD Ticket", ticket[0], ["name", "subject"], as_dict=True
    )


@frappe.whitelist(methods=["POST"])
def complete_setup() -> None:
    """Mark the first-run setup done for the whole site, whether finished or skipped.
    Safe to call again. System Managers only."""
    frappe.only_for("System Manager")
    frappe.db.set_single_value("HD Settings", "setup_complete", 1)


@frappe.whitelist(methods=["POST"])
def mark_checklist_steps(steps: list[str]) -> None:
    """Tick sidebar "Getting started" steps for the current admin.
    Rebuilds the stored list in the sidebar's order, so dropped steps cannot block it.
    """
    frappe.only_for("System Manager")
    unknown = [step for step in steps if step not in SETUP_CHECKLIST_STEPS]
    if unknown:
        frappe.throw(_("Unknown setup step: {0}").format(", ".join(unknown)))

    user = frappe.session.user
    status = frappe.parse_json(
        frappe.db.get_value("User", user, "onboarding_status") or "{}"
    )
    key = "helpdesk_onboarding_status"
    done = {step["name"] for step in status.get(key, []) if step.get("completed")}
    done.update(steps)
    status[key] = [
        {"name": name, "completed": name in done} for name in ONBOARDING_STEPS
    ]
    frappe.db.set_value(
        "User", user, "onboarding_status", frappe.as_json(status), update_modified=False
    )
