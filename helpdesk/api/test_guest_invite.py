# Copyright (c) 2026, Frappe Technologies and Contributors
# See license.txt

from unittest.mock import patch

import frappe
from frappe.core.api.user_invitation import _accept_invitation
from frappe.tests import IntegrationTestCase

from helpdesk.api.ticket import new_guest_ticket


class TestGuestInvite(IntegrationTestCase):
    """A visitor who raises a ticket is asked to claim it, and can."""

    def setUp(self) -> None:
        frappe.set_user("Administrator")
        frappe.db.set_single_value("HD Settings", "allow_anyone_to_create_tickets", 1)
        # Accepting an invitation commits, so a shared address would survive the
        # rollback and decide the next run's result. Each test gets its own.
        self.email = f"guest-invite-{frappe.generate_hash(length=8)}@example.test"

    def tearDown(self) -> None:
        frappe.set_user("Administrator")
        self.forget(self.email)

    def forget(self, email: str) -> None:
        """Remove what a committed acceptance leaves behind."""
        for doctype, filters in (
            ("HD Ticket", {"raised_by": email}),
            ("User Invitation", {"email": email}),
            ("Contact", {"email_id": email}),
            ("User", {"name": email}),
        ):
            for name in frappe.get_all(doctype, filters=filters, pluck="name"):
                frappe.delete_doc(
                    doctype,
                    name,
                    force=True,
                    ignore_permissions=True,
                    delete_permanently=True,
                )
        frappe.db.commit()  # the rows being removed were committed too

    def raise_ticket(self, subject: str = "Guest asks something") -> dict:
        frappe.set_user("Guest")
        try:
            return new_guest_ticket(
                subject=subject, description="<p>Please help.</p>", email=self.email
            )
        finally:
            frappe.set_user("Administrator")

    def invitations(self) -> list[str]:
        return frappe.get_all(
            "User Invitation",
            filters={"email": self.email, "app_name": "helpdesk"},
            pluck="name",
        )

    def test_a_new_visitor_is_invited_to_claim_the_ticket(self) -> None:
        result = self.raise_ticket()

        self.assertEqual(result["invite"], "invited")
        invitations = self.invitations()
        self.assertEqual(len(invitations), 1)
        invitation = frappe.get_doc("User Invitation", invitations[0])
        self.assertEqual(invitation.redirect_to_path, f"/kb/tickets/{result['name']}")
        self.assertEqual(
            invitation.contact,
            frappe.db.get_value("HD Ticket", result["name"], "contact"),
        )
        self.assertEqual([row.role for row in invitation.roles], ["HD Customer"])

    def test_a_second_ticket_does_not_invite_twice(self) -> None:
        self.raise_ticket()
        result = self.raise_ticket(subject="And another thing")

        self.assertEqual(result["invite"], "pending")
        self.assertEqual(len(self.invitations()), 1)

    def test_an_address_with_an_account_is_not_invited(self) -> None:
        """An agent raising one from the public form must not be handed HD Customer."""
        frappe.get_doc(
            doctype="User",
            email=self.email,
            first_name="Already",
            send_welcome_email=0,
        ).insert(ignore_permissions=True)

        result = self.raise_ticket()

        self.assertEqual(result["invite"], "has_account")
        self.assertEqual(self.invitations(), [])

    def test_the_invitation_is_queued_not_sent_inline(self) -> None:
        """`send_invitation_mail` uses `now=True`, which flushes during the request's
        own commit — an unreachable mail server would then 500 a submission whose
        ticket was already written, past the reach of any `except` here."""
        with patch("helpdesk.api.ticket.frappe.enqueue") as enqueue:
            result = self.raise_ticket()

        self.assertEqual(result["invite"], "invited")
        self.assertTrue(frappe.db.exists("HD Ticket", result["name"]))
        enqueue.assert_called_once()
        self.assertEqual(enqueue.call_args.kwargs["email"], self.email)
        self.assertEqual(enqueue.call_args.kwargs["ticket_name"], result["name"])

    def test_claiming_the_invitation_hands_over_the_ticket(self) -> None:
        result = self.raise_ticket()

        key = frappe.get_doc(
            "User Invitation", self.invitations()[0]
        ).send_invitation_mail()
        _accept_invitation(key, in_test=True)

        self.assertTrue(frappe.db.exists("User", self.email))
        contact = frappe.db.get_value("HD Ticket", result["name"], "contact")
        self.assertEqual(frappe.db.get_value("Contact", contact, "user"), self.email)
        # `has_permission` matches the reader against `raised_by`, which is what makes
        # the ticket theirs now that the address has a user.
        self.assertTrue(
            frappe.has_permission("HD Ticket", "read", result["name"], user=self.email)
        )
