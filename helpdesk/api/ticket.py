import frappe
from frappe import _
from frappe.contacts.doctype.contact.contact import get_contact_name
from frappe.rate_limiter import rate_limit
from frappe.utils import strip_html_tags, validate_email_address

from helpdesk.utils import agent_only, is_admin


@frappe.whitelist()
@agent_only
def bulk_reply(ticket_ids: list, message: str, attachments: list | None = None):

    link_attachments_to_tickets(attachments, ticket_ids)

    if not ticket_ids:
        return

    ticket_ids = list(set(ticket_ids))  # Remove duplicates

    for ticket_id in ticket_ids:
        frappe.has_permission("HD Ticket", "write", doc=ticket_id, throw=True)
        doc = frappe.get_doc("HD Ticket", ticket_id)
        try:
            doc.reply_via_agent(
                message, to=doc.raised_by, attachments=attachments or []
            )
        except Exception as e:
            frappe.log_error(
                title=f"Bulk reply failed for ticket {ticket_id}",
                message=str(e),
            )


def link_attachments_to_tickets(attachments: list | None, ticket_ids: list):
    if not attachments:
        return
    if not ticket_ids:
        return

    # only one attachment is created, but does not refer to any doctype/docname until now. Link it to all the tickets in context.
    # Done because, FileUploader only handles for one file, and cant upload to multiple doctypes/docnames at the same time.
    for a in attachments:
        file_doc = frappe.get_doc("File", a)
        file_doc.attached_to_doctype = "HD Ticket"
        file_doc.attached_to_name = ticket_ids[0]
        file_doc.save()

    for ticket_id in ticket_ids[1:]:
        for a in attachments:
            file_doc = frappe.get_doc("File", a)
            new_file_doc = frappe.copy_doc(file_doc)
            new_file_doc.attached_to_name = ticket_id
            new_file_doc.save()


def assign_ticket_to_agent(ticket_id, agent_id=None):
    if not ticket_id:
        return

    ticket_doc = frappe.get_doc("HD Ticket", ticket_id)

    if not agent_id:
        # assign to self
        agent_id = frappe.session.user

    if not frappe.db.exists("HD Agent", agent_id):
        frappe.throw(_("Tickets can only be assigned to agents"))

    ticket_doc.assign_agent(agent_id)
    return ticket_doc


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=5, seconds=60 * 60)
def new_guest_ticket(
    subject: str, description: str, email: str, first_name: str | None = None
) -> dict:
    """Raise a ticket as a signed-out visitor, when HD Settings allows it.

    Deliberately not `hd_ticket.api.new`: that takes a whole document dict, which an
    anonymous caller could use to set status, customer, team or assignment. Only the
    four arguments here reach the ticket; everything else comes from the defaults
    `HD Ticket.before_validate` already applies.
    """
    if not frappe.db.get_single_value("HD Settings", "allow_anyone_to_create_tickets"):
        frappe.throw(_("Raising a ticket requires an account"), frappe.PermissionError)

    email = (email or "").strip()
    validate_email_address(email, throw=True)
    # Description arrives as editor HTML, so "empty" is `<p><br></p>`, not `""`.
    if not (subject or "").strip() or not strip_html_tags(description or "").strip():
        frappe.throw(_("Subject and description are required"))

    ticket = frappe.get_doc(
        {
            "doctype": "HD Ticket",
            "subject": subject.strip(),
            "description": description,
            "raised_by": email,
            "contact": get_or_create_contact(email, first_name),
            "via_customer_portal": 1,
        }
    )
    # The visitor holds no role that can insert; the setting above is the permission.
    ticket.insert(ignore_permissions=True)
    return {"name": ticket.name, "email": email}


def get_or_create_contact(email: str, first_name: str | None) -> str:
    """The Contact for `email`, created if this is the first time we've seen it.

    Giving the ticket a contact is what lets the requester see it later: signing up
    with the same address links the User to this Contact.
    """
    if contact := get_contact_name(email):
        return contact
    contact = frappe.get_doc(
        {"doctype": "Contact", "first_name": (first_name or "").strip() or email}
    )
    contact.append("email_ids", {"email_id": email, "is_primary": True})
    contact.insert(ignore_permissions=True)
    return contact.name


@frappe.whitelist()
def delete_ticket(name: str):
    if not is_admin():
        frappe.throw(
            msg=_("Only administrators can delete tickets."),
            title=_("Not Allowed"),
            exc=frappe.PermissionError,
        )
    frappe.delete_doc("HD Ticket", name, force=True, ignore_permissions=True)
