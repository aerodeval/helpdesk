"""Customer-portal settings API.

Backs the settings modal on the Studio-built portal pages. Portal users have no
role permissions on Contact or User Invitation, so member details are resolved
here, scoped to the caller's own organization (HD Customer membership).
"""

import frappe
from frappe import _
from frappe.utils import sbool, validate_email_address

from helpdesk.utils import get_customers, is_agent


@frappe.whitelist()
def get_settings() -> dict:
    """Everything the portal settings modal needs, scoped to the session user."""
    user = frappe.get_doc("User", frappe.session.user)
    context = {
        "user": {
            "name": user.name,
            "email": user.email,
            "first_name": user.first_name or "",
            "last_name": user.last_name or "",
            "full_name": user.full_name,
            "image": user.user_image,
        },
        "is_agent": is_agent(),
        "is_manager": False,
        "organization": None,
        "members": [],
    }

    membership = get_membership()
    if not membership:
        return context

    customer = frappe.get_doc("HD Customer", membership["name"])
    context["is_manager"] = bool(membership["is_manager"])
    context["organization"] = {
        "name": customer.name,
        "customer_name": customer.customer_name,
        "image": customer.image,
        "domain": customer.domain,
        "email": customer.email_id or customer.owner,
    }
    if context["is_manager"]:
        context["members"] = get_members(customer)
    return context


def get_membership() -> dict | None:
    """The session user's customer membership, preferring one they manage."""
    memberships = get_customers(get_roles=True)
    if not memberships:
        return None
    managed = [member for member in memberships if member.get("is_manager")]
    return (managed or list(memberships))[0]


def get_managed_customer():
    """The HD Customer the session user manages; throws if they manage none."""
    for membership in get_customers(get_roles=True):
        if membership.get("is_manager"):
            return frappe.get_doc("HD Customer", membership["name"])
    frappe.throw(_("You are not a manager of any organization"), frappe.PermissionError)


def get_members(customer) -> list[dict]:
    """Active members (from the contacts table) followed by pending invites."""
    contact_names = [row.contact_name for row in customer.contacts]
    details = {}
    if contact_names:
        rows = frappe.get_all(
            "Contact",
            filters={"name": ["in", contact_names]},
            fields=["name", "full_name", "email_id", "image"],
        )
        details = {row.name: row for row in rows}

    members = []
    for row in customer.contacts:
        info = details.get(row.contact_name)
        members.append(
            {
                "contact": row.contact_name,
                "full_name": (info and info.full_name) or row.contact_name,
                "email": info and info.email_id,
                "image": info and info.image,
                "is_manager": bool(row.is_manager),
                "is_owner": row.contact_name == customer.primary_contact,
                "pending": False,
            }
        )
    members.sort(
        key=lambda member: (
            not member["is_owner"],
            not member["is_manager"],
            (member["full_name"] or "").lower(),
        )
    )
    return members + get_pending_members(customer.name)


def get_pending_members(customer_name: str) -> list[dict]:
    invites = frappe.get_all(
        "User Invitation",
        filters={
            "app_name": "helpdesk",
            "status": "Pending",
            "customer": customer_name,
        },
        fields=["name", "email"],
    )
    pending = []
    for invite in invites:
        roles = frappe.get_all(
            "User Role",
            filters={"parent": invite.name, "parenttype": "User Invitation"},
            pluck="role",
        )
        pending.append(
            {
                "invitation": invite.name,
                "contact": None,
                "full_name": invite.email.split("@")[0],
                "email": invite.email,
                "image": None,
                "is_manager": "HD Customer Manager" in roles,
                "is_owner": False,
                "pending": True,
            }
        )
    return pending


@frappe.whitelist()
def update_profile(
    first_name: str | None = None,
    last_name: str | None = None,
    image: str | None = None,
) -> dict:
    """Update the session user's own profile. Deliberately limited to these fields."""
    user = frappe.get_doc("User", frappe.session.user)
    if first_name is not None:
        user.first_name = first_name
    if last_name is not None:
        user.last_name = last_name
    if image is not None:
        user.user_image = image or None
    user.save(ignore_permissions=True)
    sync_contact(user)
    return {"full_name": user.full_name, "image": user.user_image}


def sync_contact(user) -> None:
    """Mirror profile changes onto the linked Contact so member lists stay current."""
    contact_name = frappe.db.get_value("Contact", {"user": user.name})
    if not contact_name:
        return
    contact = frappe.get_doc("Contact", contact_name)
    contact.first_name = user.first_name
    contact.last_name = user.last_name
    contact.image = user.user_image
    contact.save(ignore_permissions=True)


@frappe.whitelist()
def update_member_role(contact: str, is_manager) -> None:
    """Toggle a member between manager and member in the caller's organization."""
    customer = get_managed_customer()
    if contact == customer.primary_contact:
        frappe.throw(_("The owner's role cannot be changed"))
    row = next((row for row in customer.contacts if row.contact_name == contact), None)
    if not row:
        frappe.throw(_("{0} is not a member of {1}").format(contact, customer.name))
    row.is_manager = int(sbool(is_manager))
    customer.save()  # role sync happens in HD Customer.before_save


@frappe.whitelist()
def remove_member(contact: str) -> None:
    """Remove a member from the caller's organization."""
    customer = get_managed_customer()
    if contact == customer.primary_contact:
        frappe.throw(_("The owner cannot be removed"))
    if not any(row.contact_name == contact for row in customer.contacts):
        frappe.throw(_("{0} is not a member of {1}").format(contact, customer.name))
    customer.remove_contact(contact)
    customer.save()


@frappe.whitelist()
def cancel_invitation(invitation: str) -> None:
    """Cancel a pending invitation that belongs to the caller's organization."""
    customer = get_managed_customer()
    invitation_doc = frappe.get_doc("User Invitation", invitation)
    if invitation_doc.customer != customer.name:
        frappe.throw(
            _("This invitation does not belong to your organization"),
            frappe.PermissionError,
        )
    invitation_doc.flags.ignore_permissions = True
    invitation_doc.cancel_invite()


@frappe.whitelist()
def update_organization(
    customer_name: str | None = None,
    image: str | None = None,
    email: str | None = None,
) -> str:
    """Update the caller's organization name, logo or admin email."""
    customer = get_managed_customer()
    if image is not None:
        customer.image = image or None
    if email:
        validate_email_address(email, throw=True)
        customer.email_id = email
    customer.save()
    if customer_name and customer_name != customer.name:
        return frappe.rename_doc("HD Customer", customer.name, customer_name)
    return customer.name


@frappe.whitelist()
def delete_organization() -> None:
    """Danger zone: delete the caller's organization. Tickets are unlinked, not deleted."""
    customer = get_managed_customer()
    frappe.delete_doc("HD Customer", customer.name)
