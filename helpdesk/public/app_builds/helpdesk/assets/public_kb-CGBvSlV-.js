import { t as e } from "./settings-MvlymeDD.js";
import { P as t, h as n, l as r } from "./studioRenderer-Dce1CqVj.js";
function i(i) {
  let { articles: a, HD_Article_Category: o, route: s } = i,
    c = t(``),
    l = t(`All`),
    u = n(() => {
      let e = a.data || [],
        t = c.value.toLowerCase(),
        n = t
          ? e.filter(
              (e) =>
                (e.title || ``).toLowerCase().includes(t) ||
                (e.content || ``).toLowerCase().includes(t)
            )
          : e;
      return l.value === `New`
        ? [...n].sort(
            (e, t) => new Date(t.published_on) - new Date(e.published_on)
          )
        : l.value === `Popular`
        ? [...n].sort((e, t) => (t.views || 0) - (e.views || 0))
        : n;
    }),
    d = n(() => o.data || []);
  function f(e) {
    if (!e) return ``;
    let t = new Date(e),
      n = Math.floor((new Date() - t) / 1e3);
    return n < 60
      ? `just now`
      : n < 3600
      ? `${Math.floor(n / 60)} minutes ago`
      : n < 86400
      ? `${Math.floor(n / 3600)} hours ago`
      : n < 2592e3
      ? `${Math.floor(n / 86400)} days ago`
      : n < 31536e3
      ? `${Math.floor(n / 2592e3)} months ago`
      : `${Math.floor(n / 31536e3)} years ago`;
  }
  function p(e) {
    if (!e) return ``;
    let t = e
      .replace(/<[^>]*>/g, ` `)
      .replace(/\s+/g, ` `)
      .trim();
    return t.length > 120 ? t.slice(0, 120) + `…` : t;
  }
  function m(e) {
    return e
      ? e
          .split(` `)
          .map((e) => e[0])
          .join(``)
          .toUpperCase()
          .slice(0, 2)
      : `?`;
  }
  let h = t(!1);
  return r(
    r({}, e()),
    {},
    {
      navMenuOpen: h,
      searchQuery: c,
      activeTab: l,
      filteredArticles: u,
      categoryData: d,
      timeAgo: f,
      getExcerpt: p,
      getInitials: m,
    }
  );
}
export { i as default };
//# sourceMappingURL=public_kb-CGBvSlV-.js.map
