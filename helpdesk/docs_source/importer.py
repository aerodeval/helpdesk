import json
from urllib.parse import urlsplit

import frappe
from frappe import _
from frappe.utils import now, sha256_hash

from helpdesk.docs_source import llms, sitemap
from helpdesk.docs_source.fetch import MAX_CANDIDATES, DocsFetchError
from helpdesk.docs_source.text import absolute_links, visible_text
from helpdesk.helpdesk.doctype.hd_article_category.hd_article_category import (
    batched_article_index,
    index_articles,
)

# Pages queued per run; importing the address again picks up the next batch.
MAX_PAGES = 200
TITLE_LENGTH = 140
URL_LENGTH = 500
GONE_STATUSES = (404, 410)
DENIED_STATUSES = (401, 403, 429)
JOB_ID = "docs_import"
RESULT_KEY = "docs_import_result"
RUNNING_SECONDS = 3600
PAGE_JOB_TIMEOUT = 120
# A run with no page finished for this long has stopped (its worker died or is down).
ALIVE_KEY = "docs_import_alive"
STALL_SECONDS = 600
RESULT_SECONDS = 7 * 24 * 3600


class DocsImportError(Exception):
    """What went wrong, worded for the person who pasted the address."""


def normalize_url(url: str) -> str:
    """The pasted address as `https://host[/path]`, or a DocsImportError."""
    bad = DocsImportError(
        _("Enter a public https:// address, like https://docs.example.com.")
    )
    if not isinstance(url, str) or len(url) > URL_LENGTH:
        raise bad
    url = url.strip()
    if "://" not in url:
        url = f"https://{url}"
    try:
        parts = urlsplit(url)
        host, _port = parts.hostname, parts.port
    except ValueError:
        raise bad from None
    if parts.scheme != "https" or not host or parts.username or parts.password:
        raise bad
    return f"https://{parts.netloc.lower()}{parts.path.rstrip('/')}"


def page_key(url: str) -> str:
    """The stored address of a page: no fragment, query, trailing slash or `.md`."""
    parts = urlsplit(url)
    path = parts.path.rstrip("/").removesuffix(".md")
    return f"https://{parts.netloc.lower()}{path}"


class DocsImport:
    """Copy up to MAX_PAGES new pages of a docs site into a category as Draft
    Articles, one background job per page."""

    def __init__(self, url: str, category: str):
        self.url = normalize_url(url)
        self.category = category
        self.host = urlsplit(self.url).hostname

    def run(self) -> dict | None:
        """Find the new pages and queue a job for each. Returns the counts when there is
        nothing to copy; otherwise the last page job stores them (see `finish_run`)."""
        self.report("finding")
        new, skipped = self.drop_imported(self.find_pages())
        new = dict(list(new.items())[:MAX_PAGES])
        if not new:
            return {"created": 0, "skipped": skipped, "failed": 0, "unreadable": []}
        run = frappe.generate_hash(length=10)
        # Written before the first job is queued, so a fast page job finds it.
        frappe.cache.set_value(
            RESULT_KEY,
            {
                "state": "running",
                "stage": "reading",
                "done": 0,
                "total": len(new),
                "host": self.host,
                "run": run,
                "skipped": skipped,
                "category": self.category,
            },
            expires_in_sec=RUNNING_SECONDS,
        )
        mark_alive()
        for key, url in new.items():
            enqueue_page(
                run=run, key=key, url=url, category=self.category, host=self.host
            )
        return None

    def find_pages(self) -> list[str]:
        """Page URLs from llms.txt, else sitemap.xml."""
        error = None
        # A pasted sitemap address skips llms.txt.
        sources = (sitemap,) if sitemap.is_sitemap_url(self.url) else (llms, sitemap)
        for source in sources:
            try:
                urls = source.find_pages(self.url)
            except DocsFetchError as e:
                if e.status not in GONE_STATUSES:
                    error = error or e
                continue
            if urls:
                return urls
        if error:
            raise DocsImportError(self.friendly(error))
        raise DocsImportError(self.not_found())

    def drop_imported(self, urls: list[str]) -> tuple[dict[str, str], int]:
        """The new pages as `{key: url}`, and how many were already imported."""
        pages = {}
        for url in urls:
            key = page_key(url)
            if len(key) <= URL_LENGTH:
                pages.setdefault(key, url)
        imported = set(
            frappe.get_list(
                "HD Article",
                filters={"docs_page_url": ["in", list(pages)]},
                pluck="docs_page_url",
                limit=MAX_CANDIDATES,
            )
        )
        return {k: u for k, u in pages.items() if k not in imported}, len(imported)

    def import_page(self, key: str, url: str) -> str | None:
        """Copy one page. Returns why it was not copied, or None; the run goes on."""
        frappe.db.savepoint("docs_page")
        try:
            page = self.read_one(url)
            if not page:
                return "no_text"
            self.insert_draft(key, *page)
            frappe.db.commit()  # keeps the pages already copied if the job is killed
            return None
        except DocsFetchError as e:
            return fetch_reason(e)
        except Exception:
            frappe.db.rollback(save_point="docs_page")
            frappe.log_error(f"Docs import failed: {key}")
            return "failed"

    def read_one(self, url: str) -> tuple[str, str] | None:
        """The page's title and HTML, or None when it has no title or no text."""
        title, html = llms.read_page(url)
        title = title[:TITLE_LENGTH]
        return (
            (title, absolute_links(html, url)) if title and visible_text(html) else None
        )

    def insert_draft(self, key: str, title: str, html: str) -> None:
        article = frappe.get_doc(
            {
                "doctype": "HD Article",
                "title": title,
                "category": self.category,
                "content": html,
                "status": "Draft",
                "docs_page_url": key,
                "docs_copied_on": now(),
            }
        ).insert()
        article.db_set("docs_content_hash", sha256_hash(article.content or ""))

    def report(self, stage: str, done: int = 0, total: int = 0) -> None:
        """Progress for the settings page: a cache write, no database."""
        frappe.cache.set_value(
            RESULT_KEY,
            {
                "state": "running",
                "stage": stage,
                "done": done,
                "total": total,
                "host": self.host,
            },
            expires_in_sec=RUNNING_SECONDS,
        )

    def friendly(self, error: DocsFetchError) -> str:
        """Plain words for a failed fetch, never the error text."""
        if error.status in DENIED_STATUSES:
            return _(
                "{0} did not let us read its pages. Check that the site is public and allows crawlers."
            ).format(self.host)
        if error.transient or (error.status or 0) >= 500:
            return _("{0} did not answer in time. Try again in a few minutes.").format(
                self.host
            )
        if error.status:
            return self.not_found()
        return _(
            "We can't reach that address. Use the public address of your docs site."
        )

    def not_found(self) -> str:
        return _(
            "We couldn't find an llms.txt or sitemap.xml on {0}. Check the address, or try the root of the docs site."
        ).format(self.host)


def fetch_reason(error: DocsFetchError) -> str:
    """Why a page fetch failed, as a code the settings page words."""
    if error.status in GONE_STATUSES:
        return "not_found"
    if error.status in DENIED_STATUSES:
        return "blocked"
    if error.transient:
        return "timed_out"
    if (error.status or 0) >= 500:
        return "server_error"
    return "failed"


def mark_alive() -> None:
    frappe.cache.set_value(ALIVE_KEY, 1, expires_in_sec=STALL_SECONDS)


def is_alive() -> bool:
    return bool(frappe.cache.get_value(ALIVE_KEY))


def _outcomes_key(run: str) -> str:
    return f"docs_import_outcomes:{run}"


def pages_done(run: str) -> int:
    return frappe.cache.llen(_outcomes_key(run))


def enqueue_page(**kwargs) -> None:
    frappe.enqueue(import_page_job, queue="long", timeout=PAGE_JOB_TIMEOUT, **kwargs)


def import_page_job(run: str, key: str, url: str, category: str, host: str) -> None:
    """One page of a run: copy it, record what happened, and finish the run when it
    is the last page."""
    with batched_article_index(send=False) as articles:
        reason = DocsImport(f"https://{host}", category).import_page(key, url)
    outcome = {"url": url, "reason": reason, "articles": articles}
    # RPUSH is atomic, so its length tells exactly one job that it was the last.
    done = frappe.cache.rpush(_outcomes_key(run), json.dumps(outcome))
    frappe.cache.expire(frappe.cache.make_key(_outcomes_key(run)), RUNNING_SECONDS)
    mark_alive()
    state = frappe.cache.get_value(RESULT_KEY)
    if state and state.get("run") == run and done == state["total"]:
        finish_run(run, state)


def finish_run(run: str, state: dict) -> None:
    """Store the counts of a finished run, and index its new articles in one job."""
    outcomes = [json.loads(o) for o in frappe.cache.lrange(_outcomes_key(run), 0, -1)]
    frappe.cache.delete_value(_outcomes_key(run))
    unreadable = [
        {"url": o["url"], "reason": o["reason"]} for o in outcomes if o["reason"]
    ]
    created = len(outcomes) - len(unreadable)
    index_articles([name for o in outcomes for name in o["articles"]])
    host = state["host"]
    if created:
        result = {
            "state": "done",
            "created": created,
            "skipped": state["skipped"],
            "failed": len(unreadable),
            "unreadable": unreadable,
            "host": host,
            "category": state["category"],
        }
    else:
        message = _("We found pages on {0} but could not read any of them.")
        result = {"state": "error", "message": message.format(host), "host": host}
    frappe.cache.set_value(RESULT_KEY, result, expires_in_sec=RESULT_SECONDS)


def run_import(url: str, category: str) -> None:
    """The background job: find the pages and queue their jobs, or store a plain error
    (or the counts, when there is nothing new) for the page."""
    host = urlsplit(url).hostname or ""
    try:
        counts = DocsImport(url, category).run()
        if counts is None:
            return  # the page jobs store the result
        result = {"state": "done", **counts, "host": host, "category": category}
    except DocsImportError as e:
        result = {"state": "error", "message": str(e), "host": host}
    except Exception:
        frappe.db.rollback()
        frappe.log_error("Docs import failed")
        message = _(
            "Something went wrong while importing. Try again, and if it keeps happening, ask your administrator to check the Error Log."
        )
        result = {"state": "error", "message": message, "host": host}
    frappe.cache.set_value(RESULT_KEY, result, expires_in_sec=RESULT_SECONDS)
    frappe.db.commit()
