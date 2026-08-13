import frappe
from bs4 import BeautifulSoup
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import get_user_info_for_avatar

from helpdesk.utils import is_agent


@frappe.whitelist(allow_guest=True)
def get_article(name: str):
    article = frappe.get_doc("HD Article", name).as_dict()

    if not is_agent() and article["status"] != "Published":
        frappe.throw(_("Access denied"), frappe.PermissionError)

    author = get_user_info_for_avatar(article["author"])
    feedback = (
        frappe.db.get_value(
            "HD Article Feedback",
            {"article": name, "user": frappe.session.user},
            "feedback",
        )
        or 0
    )

    return {
        "name": article.name,
        "title": article.title,
        "content": article.content,
        "author": author,
        "creation": article.creation,
        "status": article.status,
        "published_on": article.published_on,
        "modified": article.modified,
        "category_name": frappe.db.get_value(
            "HD Article Category", article.category, "category_name"
        ),
        "category_id": article.category,
        "feedback": int(feedback),
    }

    return article


@frappe.whitelist()
def delete_articles(articles: list[str]):
    for article in articles:
        frappe.delete_doc("HD Article", article)


@frappe.whitelist()
def create_category(title: str):
    if title.strip().lower() == "general":
        frappe.throw(
            _(
                "General is a reserved category name. Please use a different name to proceed."
            )
        )
    category = frappe.new_doc("HD Article Category", category_name=title).insert()
    article = frappe.new_doc(
        "HD Article", title="New Article", category=category.name
    ).insert()
    return {"article": article.name, "category": category.name}


@frappe.whitelist()
def move_to_category(category: str, articles: list[str]):
    frappe.has_permission("HD Article", "write", throw=True)

    for article in articles:
        try:
            article_category = frappe.db.get_value("HD Article", article, "category")
            category_existing_articles = frappe.db.count(
                "HD Article", {"category": article_category}
            )
            if category_existing_articles == 1:
                frappe.throw(_("Category must have atleast one article"))
                return
            else:
                frappe.db.set_value(
                    "HD Article", article, "category", category, update_modified=False
                )
        except Exception as e:
            frappe.db.rollback()
            frappe.throw(_("Error moving article to category"))


@frappe.whitelist()
def get_categories():
    categories = frappe.get_all(
        "HD Article Category",
        fields=["name", "category_name", "modified"],
    )
    for c in categories:
        c["article_count"] = frappe.db.count(
            "HD Article", filters={"category": c.name, "status": "Published"}
        )

    categories.sort(key=lambda c: c["article_count"], reverse=True)
    categories = [c for c in categories if c["article_count"] > 0]
    return categories


@frappe.whitelist(allow_guest=True)
def get_popular_categories(limit: int = 3) -> list[dict]:
    """Categories drawing the most article views, most-viewed first.

    Backs the portal's "Popular searches" chips, so they track real traffic
    instead of being hand-maintained. Categories with no views are left out.
    """
    views = {}
    for article in frappe.get_all(
        "HD Article", filters={"status": "Published"}, fields=["category", "views"]
    ):
        # category is optional on HD Article; an uncategorised one has no chip.
        if not article.category:
            continue
        views[article.category] = views.get(article.category, 0) + (article.views or 0)

    ranked = sorted(
        ((category, total) for category, total in views.items() if total),
        key=lambda item: item[1],
        reverse=True,
    )[: int(limit)]

    return [
        {
            "name": category,
            "label": frappe.db.get_value(
                "HD Article Category", category, "category_name"
            )
            or category,
            "views": total,
        }
        for category, total in ranked
    ]


# The public knowledge base reads through the four endpoints below rather than
# `frappe.client.get_list`/`get`, which frappe does not open to guests. The field
# lists are fixed and the status filter is not a parameter, so an anonymous caller
# can widen neither.
PUBLIC_ARTICLE_FIELDS = [
    "name",
    "title",
    "content",
    "author",
    "owner",
    "category",
    "status",
    "published_on",
    "modified",
    "views",
]
PUBLIC_CATEGORY_FIELDS = ["name", "category_name", "description", "icon"]


@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_public_articles(
    category: str | None = None, limit: int | None = None
) -> list[dict]:
    """Published articles, newest first, optionally within one category."""
    filters = {"status": "Published"}
    if category:
        filters["category"] = category
    return frappe.get_all(
        "HD Article",
        filters=filters,
        fields=PUBLIC_ARTICLE_FIELDS,
        order_by="published_on desc",
        limit_page_length=int(limit) if limit else 0,
    )


@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_public_article(name: str) -> dict:
    """One article, published — or any article to an agent previewing a draft."""
    article = frappe.db.get_value(
        "HD Article", name, PUBLIC_ARTICLE_FIELDS, as_dict=True
    )
    if not article or (article.status != "Published" and not is_agent()):
        frappe.throw(_("Article not found"), frappe.DoesNotExistError)
    return article


@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_public_categories(limit: int | None = None) -> list[dict]:
    return frappe.get_all(
        "HD Article Category",
        fields=PUBLIC_CATEGORY_FIELDS,
        order_by="category_name asc",
        limit_page_length=int(limit) if limit else 0,
    )


@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_public_category(name: str) -> dict:
    category = frappe.db.get_value(
        "HD Article Category", name, PUBLIC_CATEGORY_FIELDS, as_dict=True
    )
    if not category:
        frappe.throw(_("Category not found"), frappe.DoesNotExistError)
    return category


@frappe.whitelist()
def get_category_articles(category: str):
    articles = frappe.get_all(
        "HD Article",
        filters={"category": category, "status": "Published"},
        fields=["name", "title", "published_on", "modified", "author", "content"],
    )
    for article in articles:
        article["author"] = get_user_info_for_avatar(article["author"])
        soup = BeautifulSoup(article["content"], "html.parser")
        article["content"] = str(soup.text)[:100]

    return articles


@frappe.whitelist()
def merge_category(source: str, target: str):
    frappe.has_permission("HD Article Category", "delete", throw=True)

    if source == target:
        frappe.throw(_("Source and target category cannot be same"))
    general_category = get_general_category()
    if source == general_category:
        frappe.throw(_("Cannot merge General category"))
    source_articles = frappe.get_all(
        "HD Article",
        filters={"category": source},
        pluck="name",
    )
    for article in source_articles:
        frappe.db.set_value(
            "HD Article", article, "category", target, update_modified=False
        )

    frappe.delete_doc("HD Article Category", source)


@frappe.whitelist()
def get_general_category():
    return frappe.db.get_value(
        "HD Article Category", {"category_name": "General"}, "name"
    )


@frappe.whitelist()
def get_category_title(category: str):
    return frappe.db.get_value("HD Article Category", category, "category_name")


@frappe.whitelist()
@rate_limit(key="article", seconds=60 * 60)
def increment_views(article: str):
    views = frappe.db.get_value("HD Article", article, "views") or 0
    views += 1
    frappe.db.set_value("HD Article", article, "views", views, update_modified=False)
