import frappe
from frappe.tests import IntegrationTestCase

from helpdesk.api.ticket import new_guest_ticket
from helpdesk.test_utils import get_latest_ticket_communication

DESCRIPTION = "<p>The invoice page is blank.</p>"


class TestGuestTicket(IntegrationTestCase):
    """`new_guest_ticket` is the portal's only anonymous write, so it is tested as a
    trust boundary: what it refuses matters as much as what it creates."""

    original_user = None

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.original_user = frappe.session.user

    def setUp(self):
        self.set_setting(1)
        frappe.set_user("Guest")

    def tearDown(self):
        frappe.set_user(self.original_user or "Administrator")

    def set_setting(self, value):
        frappe.set_user(self.original_user or "Administrator")
        frappe.db.set_single_value(
            "HD Settings", "allow_anyone_to_create_tickets", value
        )
        frappe.set_user("Guest")

    def test_enabling_it_does_not_expose_other_tickets(self):
        self.apply_permission_grant()

        # `add_permission` seeds a new row with read already on, so every permission
        # is asserted rather than only the one being granted.
        self.assertEqual(
            frappe.get_all(
                "Custom DocPerm",
                filters={"parent": "HD Ticket", "role": "Guest"},
                fields=["create", "read", "write", "delete", "if_owner"],
            ),
            [{"create": 1, "read": 0, "write": 0, "delete": 0, "if_owner": 0}],
        )
        self.assertFalse(frappe.has_permission("HD Ticket", "read"))
        self.assertTrue(frappe.has_permission("HD Ticket", "create"))

    def test_the_endpoint_is_reachable_without_a_session(self):
        # The setting is the permission; being callable at all is the precondition.
        self.assertIn(new_guest_ticket, frappe.guest_methods)

    def test_setting_off_refuses_the_request(self):
        self.set_setting(0)

        with self.assertRaises(frappe.PermissionError):
            self.raise_ticket("blocked@example.com")

    def test_ticket_is_raised_against_the_entered_email(self):
        result = self.raise_ticket("visitor@example.com")

        ticket = frappe.get_doc("HD Ticket", result["name"])
        self.assertEqual(ticket.raised_by, "visitor@example.com")
        self.assertEqual(ticket.via_customer_portal, 1)
        self.assertEqual(
            frappe.db.get_value("Contact", ticket.contact, "email_id"),
            "visitor@example.com",
        )

    def test_first_message_is_attributed_to_the_requester(self):
        # Not to "Guest": the opening message is what the agent replies to.
        result = self.raise_ticket("sender@example.com")

        communication = get_latest_ticket_communication(result["name"])
        self.assertEqual(communication.sender, "sender@example.com")

    def test_a_signed_in_requester_still_sends_as_themselves(self):
        frappe.set_user("Administrator")
        ticket = frappe.get_doc(
            {"doctype": "HD Ticket", "subject": "Signed in", "description": DESCRIPTION}
        ).insert()

        # Communication normalises the sender to the User's email, which for
        # Administrator is not its docname.
        communication = get_latest_ticket_communication(ticket.name)
        self.assertEqual(
            communication.sender,
            frappe.db.get_value("User", "Administrator", "email"),
        )

    def test_a_known_contact_is_reused(self):
        first = self.raise_ticket("repeat@example.com", first_name="Ada")
        second = self.raise_ticket("repeat@example.com", first_name="Ada")

        self.assertEqual(
            frappe.db.get_value("HD Ticket", first["name"], "contact"),
            frappe.db.get_value("HD Ticket", second["name"], "contact"),
        )

    def test_invalid_email_is_rejected(self):
        with self.assertRaises(frappe.ValidationError):
            self.raise_ticket("not-an-email")

    def test_empty_description_is_rejected(self):
        with self.assertRaises(frappe.ValidationError):
            self.raise_ticket("blank@example.com", description="<p><br></p>")

    def test_caller_cannot_choose_the_status(self):
        # The endpoint takes four named arguments, so a payload field like `status`
        # cannot reach the document at all — it is a TypeError, not a silent write.
        with self.assertRaises(TypeError):
            new_guest_ticket(
                subject="Sneaky",
                description=DESCRIPTION,
                email="sneaky@example.com",
                status="Closed",
            )

    def apply_permission_grant(self):
        """Saving HD Settings is what re-applies the Guest role's permissions."""
        frappe.set_user(self.original_user or "Administrator")
        frappe.get_doc("HD Settings").save()
        frappe.clear_cache()
        frappe.set_user("Guest")

    def raise_ticket(self, email, description=DESCRIPTION, first_name=None):
        return new_guest_ticket(
            subject="Invoice page is blank",
            description=description,
            email=email,
            first_name=first_name,
        )
