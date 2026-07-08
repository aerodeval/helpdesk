import { t as e } from "./settings-MvlymeDD.js";
import {
  M as t,
  P as n,
  f as r,
  h as i,
  l as a,
} from "./studioRenderer-Dce1CqVj.js";
function o(o) {
  let {
    categories: s,
    articles: c,
    article: l,
    route: u,
    router: d,
    call: f,
    toast: p,
  } = o;
  function m(e) {
    if (!e) return ``;
    let t = new Date(e);
    return isNaN(t.getTime())
      ? e
      : t.toLocaleDateString(`en-GB`, {
          day: `numeric`,
          month: `short`,
          year: `numeric`,
        });
  }
  let h = i(() => {
      var e;
      let t = ((e = l.doc) == null ? void 0 : e.content) || ``,
        n = new DOMParser().parseFromString(t, `text/html`),
        r = Array.from(n.querySelectorAll(`h1, h2, h3`)).map((e, t) => {
          let n = `section-` + t;
          return (
            e.setAttribute(`id`, n),
            {
              id: n,
              text: (e.textContent || ``).trim(),
              level: Number(e.tagName[1]),
            }
          );
        });
      return { html: n.body.innerHTML, toc: r };
    }),
    g = i(() => h.value.html),
    _ = i(() => h.value.toc),
    v = i(() => {
      let e = u.params.name,
        t = s.data || [],
        n = c.data || [];
      return t.map((t) => ({
        name: t.name,
        label: t.category_name || t.name,
        children: n
          .filter((e) => e.category === t.name)
          .map((t) => ({
            name: t.name,
            label: t.title,
            isActive: t.name === e,
          })),
      }));
    }),
    y = i(() => {
      let e = l.doc;
      return e
        ? (c.data || [])
            .filter((t) => t.category === e.category && t.name !== e.name)
            .slice(0, 6)
        : [];
    }),
    b = n(null),
    x = n(null),
    S = n(null);
  function C(e) {
    return w.apply(this, arguments);
  }
  function w() {
    return (
      (w = r(function* (e) {
        if (((b.value = null), (x.value = null), e))
          try {
            S.value = yield f(`frappe.auth.get_logged_user`);
            let t = yield f(`frappe.client.get_list`, {
              doctype: `HD Article Feedback`,
              filters: { article: e, user: S.value },
              fields: [`name`, `feedback`],
              limit_page_length: 1,
            });
            t && t.length && ((b.value = t[0].feedback), (x.value = t[0].name));
          } catch (e) {}
      })),
      w.apply(this, arguments)
    );
  }
  t(
    () => {
      var e;
      return (e = l.doc) == null ? void 0 : e.name;
    },
    C,
    { immediate: !0 }
  );
  function T(e) {
    return E.apply(this, arguments);
  }
  function E() {
    return (
      (E = r(function* (e) {
        var t;
        let n = (t = l.doc) == null ? void 0 : t.name;
        if (n) {
          b.value = e;
          try {
            let t =
              S.value || (S.value = yield f(`frappe.auth.get_logged_user`));
            x.value
              ? yield f(`frappe.client.set_value`, {
                  doctype: `HD Article Feedback`,
                  name: x.value,
                  fieldname: `feedback`,
                  value: e,
                })
              : (x.value = (yield f(`frappe.client.insert`, {
                  doc: {
                    doctype: `HD Article Feedback`,
                    article: n,
                    user: t,
                    feedback: e,
                  },
                })).name),
              p.success(`Thanks for your feedback!`);
          } catch (e) {
            p.error(`Could not submit feedback`);
          }
        }
      })),
      E.apply(this, arguments)
    );
  }
  let D = n(!1),
    O = n(``),
    k = n(`Question`),
    A = n(``),
    j = n(``),
    M = n(`Low`);
  function N() {
    return P.apply(this, arguments);
  }
  function P() {
    return (
      (P = r(function* () {
        if (!O.value) {
          p.error(`Please enter a subject`);
          return;
        }
        try {
          yield f(`frappe.client.insert`, {
            doc: {
              doctype: `HD Ticket`,
              subject: O.value,
              ticket_type: k.value,
              description: A.value,
              priority: M.value,
            },
          }),
            p.success(`Ticket created!`),
            (D.value = !1),
            (O.value = ``),
            (A.value = ``),
            (j.value = ``);
        } catch (e) {
          p.error(`Could not create ticket`);
        }
      })),
      P.apply(this, arguments)
    );
  }
  let F = n({});
  function I(e) {
    let t = v.value.find((t) => t.name === e);
    return t ? t.children.some((e) => e.isActive) : !1;
  }
  function L(e) {
    return e in F.value ? F.value[e] : I(e);
  }
  function R(e) {
    F.value = a(a({}, F.value), {}, { [e]: !L(e) });
  }
  let z = n(!1);
  return a(
    a({}, e()),
    {},
    {
      formatDate: m,
      categoryTrees: v,
      toggleCategory: R,
      isExpanded: L,
      articleHtml: g,
      toc: _,
      relatedArticles: y,
      selectedFeedback: b,
      submitFeedback: T,
      ticketModalOpen: D,
      ticketSubject: O,
      ticketType: k,
      ticketDescription: A,
      ticketMobile: j,
      ticketPriority: M,
      createTicket: N,
      navMenuOpen: z,
    }
  );
}
export { o as default };
//# sourceMappingURL=article_view-BJF8QeVW.js.map
