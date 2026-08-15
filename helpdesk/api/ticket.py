import frappe
from frappe import _
from frappe.contacts.doctype.contact.contact import get_contact_name
from frappe.core.api.user_invitation import invite_by_email
from frappe.rate_limiter import rate_limit
from frappe.utils import strip_html_tags, validate_email_address

from helpdesk.utils import agent_only, is_admin


@frappe.whitelist()
@agent_only
def bulk_reply(ticket_ids: list, message: str, attachments: list | None = None):

    if not ticket_ids:
        return

    # dedupe but keep the order the agent picked. set() orders by hash, which varies
    # per process, and duplicates would attach the same file to a ticket twice
    ticket_ids = list(dict.fromkeys(ticket_ids))

    # Check every ticket before writing anything, so one ticket the agent cannot
    # reply to does not leave the rest of the batch half done
    tickets = []
    for ticket_id in ticket_ids:
        frappe.has_permission("HD Ticket", "write", doc=ticket_id, throw=True)
        tickets.append(frappe.get_doc("HD Ticket", ticket_id))

    link_attachments_to_tickets(attachments, ticket_ids)

    for doc in tickets:
        try:
            doc.reply_via_agent(
                message, to=doc.raised_by, attachments=attachments or []
            )
        except Exception as e:
            frappe.log_error(
                title=f"Bulk reply failed for ticket {doc.name}",
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
    return {"name": ticket.name, "email": email, "invite": invite_requester(ticket)}


def invite_requester(ticket) -> str:
    """Ask the requester to claim the ticket by taking an account.

    A signed-out visitor cannot come back to what they raised: `get_one` matches the
    reader against `raised_by`, so the ticket is theirs the moment a User exists for
    that address. Returns what the confirmation screen should say — "has_account",
    "pending" or "invited".
    """
    email = ticket.raised_by
    # `invite_by_email` only skips an address that accepted an invitation, so an account
    # made any other way would be invited again — and accepting adds HD Customer to it,
    # which is wrong for an agent raising a ticket from the public form.
    if frappe.db.exists("User", {"name": email, "enabled": 1}):
        return "has_account"
    if frappe.db.exists(
        "User Invitation", {"email": email, "app_name": "helpdesk", "status": "Pending"}
    ):
        return "pending"

    # Queued rather than sent inline. `send_invitation_mail` runs from `after_insert`
    # with `now=True`, which flushes the mail during the request's own `db.commit()` —
    # so on a site whose outgoing server is unreachable the submission 500s *after* the
    # ticket is written, and no `except` around this call can catch it, because the
    # failure happens once this function has already returned.
    frappe.enqueue(
        send_requester_invite,
        queue="short",
        now=frappe.flags.in_test,
        ticket_name=ticket.name,
        email=email,
        contact=ticket.contact,
    )
    return "invited"


def send_requester_invite(ticket_name: str, email: str, contact: str | None) -> None:
    """Invite the requester to claim one ticket. Runs in a worker.

    Issued by the server on the visitor's behalf, not by the visitor: `validate_role`
    admits only agent and customer-manager roles, and running as a system user also
    satisfies the `validate_customer_scope` hook on User Invitation.
    """
    frappe.set_user("Administrator")
    invite_by_email(
        emails=email,
        roles=["HD Customer"],
        redirect_to_path=f"/kb/tickets/{ticket_name}",
        app_name="helpdesk",
        contact=contact,
    )


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
