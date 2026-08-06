import frappe
from frappe.tests import IntegrationTestCase

from helpdesk.api.knowledge_base import get_popular_categories

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
