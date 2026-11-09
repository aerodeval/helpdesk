from frappe.tests import IntegrationTestCase

from helpdesk.docs_source import llms, sitemap
from helpdesk.docs_source.fetch import SITEMAP_MAX_BYTES
from helpdesk.test_utils import (
    make_docs_page,
    make_docs_site,
    make_sitemap,
    patch_docs_site,
)

HOST = "docs.example.com"
BASE = f"https://{HOST}"


class TestLlms(IntegrationTestCase):
    def test_lists_md_and_plain_links_in_order(self):
        site = {
            f"{BASE}/llms.txt": "# Docs\n\n"
            f"- [One]({BASE}/one.md): first\n"
            f"- [Two]({BASE}/guide/two)\n"
            f"* [Three](/three.md)\n",
        }
        patch_docs_site(self, site)
        self.assertEqual(
            llms.find_pages(BASE),
            [f"{BASE}/one.md", f"{BASE}/guide/two", f"{BASE}/three.md"],
        )

    def test_ignores_other_hosts_outside_path_and_dot_segments(self):
        site = {
            f"{BASE}/docs/llms.txt": f"- [In]({BASE}/docs/in.md)\n"
            f"- [Out]({BASE}/blog/out.md)\n"
            "- [Other](https://other.example.org/docs/x.md)\n"
            f"- [Dots]({BASE}/docs/../secret.md)\n"
        }
        patch_docs_site(self, site)
        self.assertEqual(llms.find_pages(f"{BASE}/docs"), [f"{BASE}/docs/in.md"])

    def test_follows_child_indexes_but_does_not_list_them(self):
        site = {
            f"{BASE}/llms.txt": f"- [Guides]({BASE}/_llms/guides.txt)\n"
            f"- [Home]({BASE}/home.md)\n",
            f"{BASE}/_llms/guides.txt": f"- [A]({BASE}/a.md)\n- [Home]({BASE}/home.md)\n",
        }
        patch_docs_site(self, site)
        self.assertEqual(llms.find_pages(BASE), [f"{BASE}/home.md", f"{BASE}/a.md"])

    def test_reads_a_md_page_as_markdown_and_others_as_html(self):
        site = make_docs_site(HOST, {"a": "Alpha"}) | {
            f"{BASE}/b": make_docs_page("Beta")
        }
        patch_docs_site(self, site)
        title, html = llms.read_page(f"{BASE}/a.md")
        self.assertEqual(title, "Alpha")
        self.assertIn("explains how", html)
        self.assertNotIn("Alpha</h1>", html)
        title, html = llms.read_page(f"{BASE}/b")
        self.assertEqual(title, "Beta")
        self.assertIn("<p>", html)

    def test_reads_title_from_front_matter_and_drops_it(self):
        page = (
            '---\ntitle: "Alpha: the start"\nspace: Guide\n---\n\n'
            "Intro text.\n\n---\n\nMore text.\n"
        )
        patch_docs_site(self, {f"{BASE}/a.md": page})
        title, html = llms.read_page(f"{BASE}/a.md")
        self.assertEqual(title, "Alpha: the start")
        self.assertNotIn("space:", html)
        self.assertIn("Intro text.", html)
        self.assertIn("More text.", html)


class TestSitemap(IntegrationTestCase):
    def test_reads_a_pasted_sitemap_address_scoped_to_its_folder(self):
        site = {
            f"{BASE}/hc/sitemap.xml": make_sitemap(
                f"{BASE}/hc/en-us/articles/1", f"{BASE}/blog/x"
            ),
        }
        fetch = patch_docs_site(self, site)
        pages = sitemap.find_pages(f"{BASE}/hc/sitemap.xml")
        self.assertEqual(pages, [f"{BASE}/hc/en-us/articles/1"])
        call = fetch.call_args
        self.assertEqual(call.kwargs["max_bytes"], SITEMAP_MAX_BYTES)

    def test_follows_the_sitemap_robots_txt_names(self):
        site = {
            f"{BASE}/robots.txt": (
                "User-agent: *\nSitemap: https://other.example.org/sitemap.xml\n"
                f"sitemap: {BASE}/hc/sitemap.xml\n"
            ),
            f"{BASE}/hc/sitemap.xml": make_sitemap(f"{BASE}/hc/en-us/articles/1"),
        }
        fetch = patch_docs_site(self, site)
        self.assertEqual(sitemap.find_pages(BASE), [f"{BASE}/hc/en-us/articles/1"])
        fetched = [c.args[0] for c in fetch.call_args_list]
        self.assertNotIn("https://other.example.org/sitemap.xml", fetched)

    def test_lists_in_scope_pages_unversioned_first(self):
        site = {
            f"{BASE}/docs/sitemap.xml": make_sitemap(
                f"{BASE}/docs/v1/old",
                f"{BASE}/docs/new",
                f"{BASE}/blog/x",
                f"{BASE}/docs/../secret",
                "https://other.example.org/docs/x",
            )
        }
        patch_docs_site(self, site)
        self.assertEqual(
            sitemap.find_pages(f"{BASE}/docs"),
            [f"{BASE}/docs/new", f"{BASE}/docs/v1/old"],
        )

    def test_follows_a_sitemap_index(self):
        site = {
            f"{BASE}/sitemap.xml": '<sitemapindex xmlns="x">'
            f"<sitemap><loc>{BASE}/s1.xml</loc></sitemap>"
            f"<sitemap><loc>{BASE}/s2.xml</loc></sitemap></sitemapindex>",
            f"{BASE}/s1.xml": make_sitemap(f"{BASE}/a"),
            f"{BASE}/s2.xml": make_sitemap(f"{BASE}/b", f"{BASE}/a"),
        }
        patch_docs_site(self, site)
        self.assertEqual(sitemap.find_pages(BASE), [f"{BASE}/a", f"{BASE}/b"])

    def test_html_page_instead_of_sitemap_is_no_list(self):
        patch_docs_site(self, {f"{BASE}/sitemap.xml": make_docs_page("Not found")})
        self.assertEqual(sitemap.find_pages(BASE), [])
