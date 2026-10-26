import shutil
import tempfile
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_to_date, get_datetime, getdate, now_datetime

from helpdesk.demo import get_state, set_state
from helpdesk.demo.date_shift import DateShift, shift_dates
from helpdesk.demo.persona import get_boot, login_as_persona
from helpdesk.demo.replay import reseed
from helpdesk.test_utils import enable_demo, make_demo_fixture, make_ticket

T = "2026-10-26 09:00:00"


class TestDemo(IntegrationTestCase):
    def setUp(self):
        self.fixture_dir = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.fixture_dir)
        self.personas = make_demo_fixture(self.fixture_dir)

    def test_replay_and_shift_refuse_without_the_demo_flag(self):
        with self.assertRaises(frappe.ValidationError):
            reseed(self.fixture_dir)
        with self.assertRaises(frappe.ValidationError):
            DateShift().run()
        shift_dates()  # the cron stays silent on a normal site

    def test_replay_and_shift_refuse_a_site_with_unseeded_tickets(self):
        enable_demo(self)
        frappe.defaults.clear_default(key="demo_seed_version", parent="__default")
        ticket = make_ticket(subject="A real customer's ticket")
        with self.assertRaises(frappe.ValidationError):
            reseed(self.fixture_dir)
        with self.assertRaises(frappe.ValidationError):
            DateShift().run()
        self.assertTrue(frappe.db.exists("HD Ticket", ticket.name))

    def test_replay_backdates_the_ticket_and_its_thread(self):
        ticket = self.seed()
        creation, opening_date, status = frappe.db.get_value(
            "HD Ticket", ticket, ["creation", "opening_date", "agreement_status"]
        )
        self.assertEqual(creation, get_datetime(add_to_date(T, minutes=-10)))
        self.assertEqual(opening_date, getdate(T))
        self.assertEqual(status, "First Response Due")
        comment = frappe.db.get_value(
            "Comment",
            {"reference_doctype": "HD Ticket", "reference_name": ticket},
            "creation",
        )
        self.assertEqual(comment, get_datetime(add_to_date(T, minutes=-5)))
        self.assertEqual(get_boot()["max_ticket"], int(ticket))

    def test_two_shifts_keep_the_due_ticket_within_20_to_30_minutes(self):
        ticket = self.seed()
        for minutes in (10, 20):
            with self.freeze_time(add_to_date(T, minutes=minutes)):
                self.assertDueInMinutes(ticket, 20)
                shift_dates()
                self.assertDueInMinutes(ticket, 30)
        self.assertEqual(
            get_datetime(get_state("anchor")), get_datetime(add_to_date(T, minutes=20))
        )

    def test_agent_persona_cannot_write(self):
        ticket = self.seed()
        with self.set_user(self.personas["agent"]):
            doc = frappe.get_doc("HD Ticket", ticket)
            doc.add_seen()  # a read path that writes `_seen` raw
            doc.subject = "Changed"
            with self.assertRaises(frappe.PermissionError):
                doc.save()
            with self.assertRaises(frappe.PermissionError):
                frappe.delete_doc("HD Ticket", ticket)

    def test_customer_persona_cannot_write(self):
        self.seed()
        with self.set_user(self.personas["customer"]):
            with self.assertRaises(frappe.PermissionError):
                make_ticket(subject="Raised by the demo customer")

    def test_persona_password_cannot_be_reset_or_changed(self):
        self.seed()
        user = frappe.get_doc("User", self.personas["customer"])
        with self.assertRaises(frappe.PermissionError):
            user.validate_reset_password()
        user.new_password = "a-new-password-123"
        with self.assertRaises(frappe.PermissionError):
            user.save(ignore_permissions=True)

    def test_login_as_persona_redirects(self):
        self.seed()
        login_manager = MagicMock()
        with patch.object(frappe.local, "login_manager", login_manager, create=True):
            login_as_persona("agent", "/helpdesk")
        login_manager.login_as.assert_called_once_with(self.personas["agent"])
        self.assertEqual(frappe.local.response["location"], "/helpdesk")

    def seed(self) -> str:
        enable_demo(self)
        # a seeded site, so the guard lets the replay wipe it
        set_state("seed_version", "previous")
        with self.freeze_time(T, tick=True):
            reseed(self.fixture_dir)
        return frappe.db.get_value(
            "HD Ticket", {"raised_by": self.personas["customer"]}
        )

    def assertDueInMinutes(self, ticket: str, minutes: int):
        due = get_datetime(frappe.db.get_value("HD Ticket", ticket, "response_by"))
        self.assertAlmostEqual(
            (due - now_datetime()).total_seconds(), minutes * 60, delta=1
        )
