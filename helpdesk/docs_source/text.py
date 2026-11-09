import re
from html import unescape
from urllib.parse import unquote, urljoin, urlsplit

import yaml
from bs4 import BeautifulSoup
from frappe.utils import strip_html_tags
from frappe.utils.html_utils import sanitize_html


def text_title(title: str) -> str:
    """A title without markup, entities or backslash escapes; `Vec<T>` keeps its `<T>`."""
    plain = unescape(strip_html_tags(title.replace("<", "&lt;")))
    return plain.replace("\\", "").strip()


NO_TAGS = (
    "form",
    "input",
    "button",
    "select",
    "textarea",
    "meta",
    "link",
    "html",
    "head",
    "body",
)


def clean_html(html: str) -> str:
    """The one sanitizer for fetched docs: no scripts, forms or document tags."""
    return sanitize_html(html, always_sanitize=True, disallowed_tags=NO_TAGS)


def in_scope(link: str, base_url: str) -> bool:
    """True for an https link on the base URL's host, inside its path, with a real route."""
    try:
        parts, base = urlsplit(link), urlsplit(base_url)
        host = parts.hostname
    except ValueError:
        return False
    path = parts.path
    return (
        parts.scheme == "https"
        and host == base.hostname
        and (path == base.path or path.startswith(f"{base.path}/"))
        and bool(path.strip("/"))
        and not any(part in (".", "..") for part in unquote(path).split("/"))
    )


def visible_text(html: str) -> str:
    return " ".join(BeautifulSoup(html, "html.parser").get_text(" ").split())


def absolute_links(html: str, base_url: str) -> str:
    """Make links and image sources absolute, so a copied page still points at the docs site."""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.select("a[href], [src]"):
        for attr in ("href", "src"):
            value = tag.get(attr)
            if value is None or (attr == "href" and tag.name != "a"):
                continue
            if value.startswith("#") or re.match(
                r"[a-z][a-z0-9+.-]*:(?!//)", value, re.I
            ):
                continue
            tag[attr] = urljoin(base_url, value)
    return str(soup)


FRONT_MATTER = re.compile(r"\A\s*---[ \t]*\n(.*?)\n---[ \t]*(?:\n|\Z)", re.S)


def split_front_matter(text: str) -> tuple[dict, str]:
    """A Markdown page's YAML front matter, and the page without it."""
    # Not frappe's get_frontmatter: its pattern also matches a `---` rule mid-page.
    match = FRONT_MATTER.match(text)
    if not match:
        return {}, text
    try:
        meta = yaml.safe_load(match[1])
    except yaml.YAMLError:
        meta = None
    return (meta if isinstance(meta, dict) else {}), text[match.end() :]


def clean_markdown(text: str, title: str) -> str:
    """A page for readers: the repeated leading title is dropped."""
    return re.sub(rf"\A\s*# {re.escape(title)}\s*\n", "", text)
