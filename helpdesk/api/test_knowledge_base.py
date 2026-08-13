import frappe
from frappe.tests import IntegrationTestCase

from helpdesk.api.knowledge_base import (
    PUBLIC_ARTICLE_FIELDS,
    PUBLIC_CATEGORY_FIELDS,
    get_popular_categories,
    get_public_article,
    get_public_articles,
    get_public_categories,
    get_public_category,
)

# The site's real articles carry real view counts, so fixtures use totals far
# above anything present to keep the ranking assertions deterministic.
BASE_VIEWS = 1_000_000
# Wide enough to cover every category on the site when asserting an absence.
ALL = 100


class TestPopularCategories(IntegrationTestCase):
    def make_category(self, label: str) -> str:
        category = frappe.get_doc(
            {"doctype": "HD Article Category", "category_name": label}
        ).insert()
        return category.name

    def make_article(
        self, category: str | None, views: int, status="Published"
    ) -> None:
        frappe.get_doc(
            {
                "doctype": "HD Article",
                "title": f"Fixture {status} {views}",
                "content": "<p>content</p>",
                "status": status,
                "category": category,
                "views": views,
            }
        ).insert()

    def labels(self, **kwargs) -> list[str]:
        return [row["label"] for row in get_popular_categories(**kwargs)]

    def names(self, **kwargs) -> list[str]:
        return [row["name"] for row in get_popular_categories(**kwargs)]

    def test_ranks_categories_by_summed_views(self) -> None:
        quiet = self.make_category("Fixture Quiet")
        loud = self.make_category("Fixture Loud")
        self.make_article(quiet, BASE_VIEWS + 1)
        # Two articles, so this also proves views are summed and not maxed.
        self.make_article(loud, BASE_VIEWS)
        self.make_article(loud, BASE_VIEWS)

        # Scoped to this test's own categories: the site's articles (and other
        # tests' fixtures) also rank, and this asserts ordering, not position.
        ranked = [
            row
            for row in get_popular_categories(limit=ALL)
            if row["name"] in {quiet, loud}
        ]
        self.assertEqual(
            [row["label"] for row in ranked], ["Fixture Loud", "Fixture Quiet"]
        )
        self.assertEqual(ranked[0]["views"], 2 * BASE_VIEWS)

    def test_caps_at_three_by_default(self) -> None:
        for index in range(4):
            self.make_article(
                self.make_category(f"Fixture {index}"), BASE_VIEWS + index
            )
        self.assertEqual(len(get_popular_categories()), 3)
        self.assertEqual(len(get_popular_categories(limit=2)), 2)

    def test_excludes_categories_with_no_views(self) -> None:
        silent = self.make_category("Fixture Silent")
        self.make_article(silent, 0)
        self.assertNotIn(silent, self.names(limit=ALL))

    def test_excludes_views_of_unpublished_articles(self) -> None:
        drafted = self.make_category("Fixture Drafted")
        self.make_article(drafted, BASE_VIEWS, status="Draft")
        self.assertNotIn(drafted, self.names(limit=ALL))

    def test_ignores_articles_without_a_category(self) -> None:
        # category is optional, and a chip with no label/route is worse than none.
        self.make_article(None, BASE_VIEWS)
        self.assertTrue(all(self.names(limit=ALL)))
        self.assertTrue(all(self.labels(limit=ALL)))


class TestPublicReads(IntegrationTestCase):
    """The four endpoints the public knowledge base reads through.

    They exist because `frappe.client.get_list`/`get` are closed to guests, so what
    matters is that they stay open to a guest while never widening past published
    articles — the field lists and the status filter are not parameters.
    """

    def setUp(self) -> None:
        self.category = frappe.get_doc(
            {
                "doctype": "HD Article Category",
                "category_name": "Fixture Public",
                "description": "Fixture description",
            }
        ).insert()
        self.published = self.make_article("Fixture published", "Published")
        self.draft = self.make_article("Fixture draft", "Draft")

    def tearDown(self) -> None:
        frappe.set_user("Administrator")

    def make_article(self, title: str, status: str) -> str:
        return (
            frappe.get_doc(
                {
                    "doctype": "HD Article",
                    "title": title,
                    "content": "<p>content</p>",
                    "status": status,
                    "category": self.category.name,
                }
            )
            .insert()
            .name
        )

    def titles(self, **kwargs) -> list[str]:
        return [row["title"] for row in get_public_articles(**kwargs)]

    def test_every_endpoint_is_reachable_without_a_session(self) -> None:
        for endpoint in (
            get_public_articles,
            get_public_article,
            get_public_categories,
            get_public_category,
        ):
            self.assertIn(endpoint, frappe.guest_methods)

    def test_lists_only_published_articles(self) -> None:
        titles = self.titles(category=self.category.name)

        self.assertIn("Fixture published", titles)
        self.assertNotIn("Fixture draft", titles)

    def test_a_guest_cannot_widen_past_published(self) -> None:
        frappe.set_user("Guest")

        self.assertNotIn("Fixture draft", self.titles(category=self.category.name))

    def test_narrows_to_one_category(self) -> None:
        other = frappe.get_doc(
            {"doctype": "HD Article Category", "category_name": "Fixture Other"}
        ).insert()
        frappe.get_doc(
            {
                "doctype": "HD Article",
                "title": "Fixture elsewhere",
                "content": "<p>content</p>",
                "status": "Published",
                "category": other.name,
            }
        ).insert()

        self.assertEqual(
            self.titles(category=self.category.name), ["Fixture published"]
        )

    def test_limit_caps_the_list(self) -> None:
        self.assertEqual(len(self.titles(limit=1)), 1)

    def test_articles_carry_a_fixed_shape(self) -> None:
        # The portal binds to these names; the caller cannot ask for others.
        [article] = get_public_articles(category=self.category.name)

        self.assertEqual(set(article), set(PUBLIC_ARTICLE_FIELDS))

    def test_reads_one_published_article(self) -> None:
        article = get_public_article(self.published)

        self.assertEqual(article.title, "Fixture published")
        self.assertEqual(set(article), set(PUBLIC_ARTICLE_FIELDS))

    def test_a_guest_cannot_read_a_draft(self) -> None:
        frappe.set_user("Guest")

        with self.assertRaises(frappe.DoesNotExistError):
            get_public_article(self.draft)

    def test_an_agent_can_preview_a_draft(self) -> None:
        self.assertEqual(get_public_article(self.draft).title, "Fixture draft")

    def test_an_unknown_article_is_not_found(self) -> None:
        with self.assertRaises(frappe.DoesNotExistError):
            get_public_article("no-such-article")

    def test_categories_carry_a_fixed_shape(self) -> None:
        [category] = [
            row for row in get_public_categories() if row["name"] == self.category.name
        ]

        self.assertEqual(set(category), set(PUBLIC_CATEGORY_FIELDS))
        self.assertEqual(category["category_name"], "Fixture Public")

    def test_reads_one_category(self) -> None:
        category = get_public_category(self.category.name)

        self.assertEqual(category.description, "Fixture description")
        self.assertEqual(set(category), set(PUBLIC_CATEGORY_FIELDS))

    def test_an_unknown_category_is_not_found(self) -> None:
        with self.assertRaises(frappe.DoesNotExistError):
            get_public_category("no-such-category")
