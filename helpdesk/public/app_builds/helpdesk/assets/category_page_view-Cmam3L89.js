import {
  B as e,
  U as t,
  b as n,
  g as r,
  t as i,
} from "./studioRenderer-CDVyqa2z.js";
function a(a) {
  let { category: o, articles: s, route: c, router: l } = a,
    u = t(``),
    d = t(!1);
  e(
    () => c.params.category,
    (e) => {
      e && (o.reload(), s.reload());
    },
    { immediate: !0 }
  );
  let f = n(() => {
      let e = s.data || [],
        t = u.value.trim().toLowerCase();
      return t
        ? e.filter(
            (e) =>
              (e.title || ``).toLowerCase().includes(t) ||
              h(e.content).toLowerCase().includes(t)
          )
        : e;
    }),
    p = n(() => {
      var e;
      return (
        ((e = o.doc) == null ? void 0 : e.category_name) ||
        c.params.category ||
        ``
      );
    }),
    m = n(() => {
      var e;
      let t = (e = o.doc) == null ? void 0 : e.description;
      if (t) return t;
      let n = p.value;
      return n ? `Find answers to common ${n} questions.` : ``;
    });
  function h(e) {
    if (!e) return ``;
    let t = e
      .replace(/<[^>]+>/g, ` `)
      .replace(/\s+/g, ` `)
      .trim();
    return t.length > 120 ? t.slice(0, 120) + `…` : t;
  }
  function g(e) {
    return e
      ? e
          .split(/[\s@.]+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((e) => e[0].toUpperCase())
          .join(``)
      : `?`;
  }
  function _(e) {
    if (!e) return ``;
    let t = new Date(e),
      n = Math.floor((new Date() - t) / 1e3);
    return n < 60
      ? `just now`
      : n < 3600
      ? `${Math.floor(n / 60)} min ago`
      : n < 86400
      ? `${Math.floor(n / 3600)} hr ago`
      : n < 2592e3
      ? `${Math.floor(n / 86400)} days ago`
      : n < 31536e3
      ? `${Math.floor(n / 2592e3)} months ago`
      : `${Math.floor(n / 31536e3)} yr ago`;
  }
  function v(e) {
    l.push({ path: `/articles/${e}` });
  }
  function y(e) {
    if (!e) return ``;
    let t = e.match(/<img[^>]+src=["']([^"']+)["']/i);
    return t ? t[1] : ``;
  }
  function b(e) {
    let t = y(e);
    return t
      ? `<img src="${t}" style="width:100%;height:100%;object-fit:cover" alt="" />`
      : ``;
  }
  return r(
    r({}, i()),
    {},
    {
      navMenuOpen: d,
      searchQuery: u,
      filteredArticles: f,
      categoryName: p,
      categoryDescription: m,
      getArticleExcerpt: h,
      getInitials: g,
      timeAgo: _,
      navigateToArticle: v,
      articleImage: y,
      articleThumbnailHtml: b,
    }
  );
}
export { a as default };
//# sourceMappingURL=category_page_view-Cmam3L89.js.map
