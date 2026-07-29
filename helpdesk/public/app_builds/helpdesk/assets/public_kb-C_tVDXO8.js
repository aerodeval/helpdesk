import { U as e, b as t } from "./studioRenderer-CDVyqa2z.js";
function n(n) {
  let { articles: r, HD_Article_Category: i, route: a, router: o } = n,
    s = e(`All`),
    c = e(``);
  function l(e = `profile`) {
    o.push({ query: a.query, hash: `#settings/${e}` });
  }
  return {
    activeTab: s,
    searchQuery: c,
    filteredArticles: t(() => {
      if (!r.data) return [];
      let e = r.data;
      if (c.value) {
        let t = c.value.toLowerCase();
        e = e.filter((e) => e.title && e.title.toLowerCase().includes(t));
      }
      return (
        s.value === `New`
          ? (e = [...e].sort((e, t) => {
              let n = e.published_on ? new Date(e.published_on) : new Date(0);
              return (
                (t.published_on ? new Date(t.published_on) : new Date(0)) - n
              );
            }))
          : s.value === `Popular` &&
            (e = [...e].sort((e, t) => (t.views || 0) - (e.views || 0))),
        e
      );
    }),
    openSettings: l,
  };
}
export { n as default };
//# sourceMappingURL=public_kb-C_tVDXO8.js.map
