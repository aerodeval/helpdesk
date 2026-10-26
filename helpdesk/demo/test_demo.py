import json
import shutil
import tempfile
from collections import Counter
from datetime import timedelta
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_to_date, get_datetime, getdate, now_datetime

from helpdesk.demo import get_state
from helpdesk.demo.date_shift import DateShift, shift_dates
from helpdesk.demo.fixture import FIXTURE_DIR
from helpdesk.demo.persona import SETTINGS_FIELDS, get_boot, login_as_persona
from helpdesk.demo.replay import reseed
from helpdesk.setup.welcome_ticket import create_welcome_ticket
from helpdesk.test_utils import (
    create_customer,
    enable_demo,
    get_first_message,
    make_demo_fixture,
    make_sla,
    make_ticket,
    seed_demo,
    unique_name,
)

T = "2026-10-26 09:00:00"
NORTHPEAK_SUBJECT = "Card payments failing for all our customers since this morning"


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

    def test_replay_takes_a_fresh_site_that_has_only_the_welcome_ticket(self):
        enable_demo(self)
        frappe.defaults.clear_default(key="demo_seed_version", parent="__default")
        frappe.db.delete("HD Ticket")
        create_welcome_ticket()
        with self.freeze_time(T, tick=True):
            reseed(self.fixture_dir)
        self.assertFalse(
            frappe.db.exists("HD Ticket", {"subject": "Welcome to Helpdesk"})
        )
        self.assertEqual(frappe.db.count("HD Ticket"), 1)

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

    def test_boot_carries_the_sla_and_settings_a_customer_cannot_read(self):
        enable_demo(self)
        customer = create_customer(unique_name("Greenleaf")).name
        sla = make_sla(
            unique_name("Growth"),
            f"doc.customer == {customer!r}",
            rank=1,
            priorities=["Urgent"],
        )
        boot = get_boot()
        self.assertEqual(boot["customer_slas"][customer], sla.name)
        self.assertNotEqual(boot["customer_slas"][""], sla.name)
        self.assertEqual(
            boot["slas"][sla.name],
            [{"priority": "Urgent", "response_time": 3600, "resolution_time": 14400}],
        )
        self.assertEqual(set(boot["settings"]), set(SETTINGS_FIELDS))

    def test_login_as_persona_redirects(self):
        self.seed()
        login_manager = MagicMock()
        with patch.object(frappe.local, "login_manager", login_manager, create=True):
            login_as_persona("agent", "/helpdesk")
        login_manager.login_as.assert_called_once_with(self.personas["agent"])
        self.assertEqual(frappe.local.response["location"], "/helpdesk")

    def test_replay_loads_the_fernbill_fixture(self):
        seed_demo(self, str(FIXTURE_DIR))
        for doctype, count in (
            ("HD Ticket", 200),
            ("HD Article", 25),
            ("HD Customer", 40),
        ):
            self.assertEqual(frappe.db.count(doctype), count, doctype)
        self.assertEqual(
            frappe.db.get_single_value("HD Settings", "brand_name"), "Fernbill"
        )
        self.assertTicketsEndInTheirFixtureStatus()
        self.assertArticlesKeepCategoryAndAuthor()
        self.assertCustomersRaisedTheirTickets()
        self.assertNorthpeakIsDueIn30Minutes()
        jamie = frappe.get_all(
            "ToDo",
            filters={
                "allocated_to": "jamie@fernbill.example",
                "reference_type": "HD Ticket",
                "status": "Open",
            },
        )
        self.assertEqual(len(jamie), 8)

    def seed(self) -> str:
        with self.freeze_time(T, tick=True):
            seed_demo(self, self.fixture_dir)
        return frappe.db.get_value(
            "HD Ticket", {"raised_by": self.personas["customer"]}
        )

    def assertDueInMinutes(self, ticket: str, minutes: int):
        due = get_datetime(frappe.db.get_value("HD Ticket", ticket, "response_by"))
        self.assertAlmostEqual(
            (due - now_datetime()).total_seconds(), minutes * 60, delta=1
        )

    def assertTicketsEndInTheirFixtureStatus(self):
        tickets = json.loads((FIXTURE_DIR / "tickets.json").read_text())
        expected = Counter(t["final_status"] for t in tickets)
        statuses = frappe.get_all("HD Ticket", pluck="status")
        self.assertEqual(Counter(statuses), expected)
        self.assertFalse(
            frappe.db.exists("HD Ticket", {"description": ["is", "not set"]})
        )

    def assertArticlesKeepCategoryAndAuthor(self):
        kb = json.loads((FIXTURE_DIR / "kb.json").read_text())
        categories = frappe.get_all(
            "HD Article Category", fields=["name", "category_name"]
        )
        titles = {c.name: c.category_name for c in categories}
        for article in frappe.get_all(
            "HD Article", fields=["title", "category", "author"]
        ):
            expected = next(a for a in kb if a.get("title") == article.title)
            self.assertEqual(titles.get(article.category), expected["category"])
            self.assertEqual(article.author, expected["author"])

    def assertCustomersRaisedTheirTickets(self):
        for ticket in frappe.get_all(
            "HD Ticket", fields=["name", "raised_by", "owner"]
        ):
            first = get_first_message(ticket.name)
            self.assertEqual(ticket.owner, ticket.raised_by)
            self.assertEqual(first.sender, ticket.raised_by)
            self.assertEqual(first.owner, ticket.raised_by)

    def assertNorthpeakIsDueIn30Minutes(self):
        due, status = frappe.db.get_value(
            "HD Ticket",
            {"customer": "Northpeak Logistics", "subject": NORTHPEAK_SUBJECT},
            ["response_by", "agreement_status"],
        )
        anchor = get_datetime(get_state("anchor"))
        self.assertEqual(get_datetime(due), anchor + timedelta(minutes=30))
        self.assertLess(now_datetime() - anchor, timedelta(minutes=10))
        self.assertEqual(status, "First Response Due")
