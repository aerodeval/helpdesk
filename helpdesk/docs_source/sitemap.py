import re
from html import unescape
from urllib.parse import urlsplit

from bs4 import BeautifulSoup

from helpdesk.docs_source.fetch import (
    MAX_CANDIDATES,
    MAX_CHILDREN,
    SITEMAP_MAX_BYTES,
    SITEMAP_TIMEOUT,
    DocsFetchError,
    fetch,
)
from helpdesk.docs_source.text import clean_html, in_scope, text_title

LOC = re.compile(r"<loc>([^<]*)</loc>")
ROBOTS_SITEMAP = re.compile(r"^\s*sitemap:\s*(\S+)", re.I | re.M)
VERSION = re.compile(r"^(v?\d+(\.(\d+|x))*|next)$")
MAIN = ("article", "[role=main]", "main")
NOISE = "nav, footer, aside, script, style"


def find_pages(url: str) -> list[str]:
    """In-scope page URLs of the site's sitemap.xml, unversioned first, following a
    sitemap index one level. A `.xml` address is read as the sitemap itself, scoped to
    its folder. Empty when there is no sitemap. Raises DocsFetchError when it can't be
    read."""
    host = urlsplit(url).hostname
    if is_sitemap_url(url):
        text = _fetch_sitemap(url, host).text
        url = url.rsplit("/", 1)[0]
    else:
        text = _read_root(url, host)
    if text is None:
        return []
    locs = _locs(text)
    if "<sitemapindex" in text:
        children = [loc for loc in locs if _host_of(loc) == host][:MAX_CHILDREN]
        locs = []
        for child in children:
            try:
                locs += _locs(_fetch_sitemap(child, host).text)
            except DocsFetchError:
                continue
    pages = list(dict.fromkeys(loc for loc in locs if in_scope(loc, url)))
    pages.sort(key=lambda page: _is_versioned(urlsplit(page).path))
    return pages[:MAX_CANDIDATES]


def extract_main(html: str) -> tuple[str, str]:
    """The title and sanitized main content of a page; empty when it has none."""
    soup = BeautifulSoup(html or "", "html.parser")
    main = next((m for sel in MAIN if (m := soup.select_one(sel))), None)
    if main is None:
        return "", ""
    for tag in main.select(NOISE):
        tag.decompose()
    heading = main.find("h1") or soup.find("title")
    title = text_title(heading.get_text()) if heading else ""
    if heading is not None and heading.name == "h1":
        heading.decompose()
    return title, clean_html(str(main))


def _read_root(url: str, host: str) -> str | None:
    """The first sitemap with links: under the path, at the host root, then the
    ones robots.txt names (Zendesk keeps its sitemap at /hc/sitemap.xml)."""
    error = None
    for root in _sitemap_urls(url, host):
        try:
            text = _fetch_sitemap(root, host).text
        except DocsFetchError as e:
            error = e
            continue
        if "<loc>" in text:
            return text
    if error:
        raise error
    return None


def is_sitemap_url(url: str) -> bool:
    return urlsplit(url).path.endswith(".xml")


def _fetch_sitemap(url: str, host: str):
    return fetch(url, host, max_bytes=SITEMAP_MAX_BYTES, timeout=SITEMAP_TIMEOUT)


def _sitemap_urls(url: str, host: str):
    """Where a sitemap may be, in order; robots.txt is read only if the first two fail."""
    tried = [f"{url}/sitemap.xml", f"https://{host}/sitemap.xml"]
    yield from dict.fromkeys(tried)
    try:
        robots = fetch(f"https://{host}/robots.txt", host).text
    except DocsFetchError:
        return
    named = dict.fromkeys(ROBOTS_SITEMAP.findall(robots))
    named = [link for link in named if _host_of(link) == host and link not in tried]
    yield from named[:MAX_CHILDREN]


def _host_of(loc: str) -> str | None:
    try:
        return urlsplit(loc).hostname
    except ValueError:
        return None


def _locs(text: str) -> list[str]:
    text = text.replace("<![CDATA[", "").replace("]]>", "")
    return [unescape(loc.strip()) for loc in LOC.findall(text)]


def _is_versioned(path: str) -> bool:
    return any(VERSION.match(part) for part in path.split("/"))
