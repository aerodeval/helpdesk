import {
  C as e,
  D as t,
  E as n,
  I as r,
  K as i,
  M as a,
  N as o,
  O as s,
  P as c,
  T as l,
  U as u,
  V as d,
  W as f,
  a as p,
  b as m,
  c as h,
  d as g,
  f as _,
  i as v,
  j as y,
  o as b,
  p as x,
  q as S,
  r as C,
  s as w,
  v as T,
  w as E,
  x as D,
} from "./studioRenderer-CDVyqa2z.js";
var O = { class: `space-y-4` },
  k = { key: 0, class: `text-red-500 text-sm mt-1` },
  A = { key: 1, class: `text-ink-green-6 text-sm mt-1` },
  j = { class: `flex justify-end space-x-2` },
  M = t({
    __name: `InsertIframe`,
    props: { editor: {} },
    setup(t) {
      let M = t,
        N = u(!1),
        P = u(``),
        F = u(``),
        I = u(``),
        L = u(`center`),
        R = u(640),
        z = u(360),
        B = u(),
        V = m(() => {
          if (!P.value) return !1;
          try {
            if (P.value.trim().startsWith(`<iframe`)) {
              let e = P.value.match(/src=["']([^"']+)["']/);
              return e != null && e[1]
                ? h(e[1], { allowedDomains: C, HTMLAttributes: {} })
                : !1;
            }
            return h(P.value, { allowedDomains: C, HTMLAttributes: {} });
          } catch (e) {
            return !1;
          }
        }),
        H = m(() => {
          if (!P.value) return ``;
          if (P.value.trim().startsWith(`<iframe`)) {
            let e = P.value.match(/src=["']([^"']+)["']/);
            return e != null && e[1] ? w(e[1]) : P.value;
          }
          return w(P.value);
        }),
        U = m(() => {
          if (!P.value || !V.value)
            return { platform: `Generic`, aspectRatio: 9 / 16 };
          let e = p(H.value),
            t = v(H.value);
          return {
            platform: (e == null ? void 0 : e.name) || `Generic`,
            aspectRatio: t.ratio,
          };
        }),
        W = m(() =>
          !P.value || !V.value ? { width: 640, height: 360 } : b(H.value, 800)
        );
      function G() {
        (F.value = ``),
          P.value &&
            (V.value ||
              (F.value = `Please enter a supported URL or iframe embed code`));
      }
      function K() {
        (N.value = !0),
          (P.value = ``),
          (F.value = ``),
          (I.value = ``),
          (L.value = `center`),
          (R.value = 640),
          (z.value = 360),
          y(() => {
            var e;
            (e = B.value) == null || (e = e.el) == null || e.focus();
          });
      }
      m(() => {
        if (P.value && V.value) {
          let e = W.value;
          (R.value = e.width), (z.value = e.height);
        }
      });
      function q() {
        !P.value ||
          !V.value ||
          (M.editor.commands.setIframe({
            src: H.value,
            width: R.value,
            height: z.value,
            title: I.value,
            align: L.value,
          })
            ? ((N.value = !1), M.editor.commands.focus())
            : (F.value = `Failed to insert embed. Please check the URL and try again.`));
      }
      function J(e) {
        var t;
        ((t = e.detail) == null ? void 0 : t.editor) === M.editor && K();
      }
      return (
        a(() => {
          M.editor.view.dom.addEventListener(`iframe:open-dialog`, J);
        }),
        o(() => {
          try {
            M.editor.view.dom.removeEventListener(`iframe:open-dialog`, J);
          } catch (e) {}
        }),
        (t, a) => (
          c(),
          E(`div`, null, [
            r(t.$slots, `default`, i(s({ onClick: K }))),
            e(` Iframe URL Input Dialog `),
            n(
              f(_),
              {
                modelValue: N.value,
                "onUpdate:modelValue": a[2] || (a[2] = (e) => (N.value = e)),
                options: { title: `Insert Embed`, size: `md` },
              },
              {
                "body-content": d(() => [
                  D(`div`, O, [
                    D(`div`, null, [
                      a[3] ||
                        (a[3] = D(
                          `label`,
                          { class: `mb-2 block text-base text-ink-gray-5` },
                          ` URL or Embed Code `,
                          -1
                        )),
                      n(
                        f(g),
                        {
                          ref_key: `urlInput`,
                          ref: B,
                          modelValue: P.value,
                          "onUpdate:modelValue":
                            a[0] || (a[0] = (e) => (P.value = e)),
                          placeholder: `https://youtube.com/watch?v=... or <iframe src=...>`,
                          onKeydown: T(q, [`enter`]),
                          onInput: G,
                        },
                        null,
                        8,
                        [`modelValue`]
                      ),
                      F.value
                        ? (c(), E(`p`, k, S(F.value), 1))
                        : P.value && V.value
                        ? (c(),
                          E(
                            `p`,
                            A,
                            ` ✓ Valid ` + S(U.value.platform) + ` URL `,
                            1
                          ))
                        : e(`v-if`, !0),
                    ]),
                  ]),
                ]),
                actions: d(() => [
                  D(`div`, j, [
                    n(
                      f(x),
                      {
                        variant: `subtle`,
                        onClick: a[1] || (a[1] = (e) => (N.value = !1)),
                      },
                      {
                        default: d(() => [
                          ...(a[4] || (a[4] = [l(`Cancel`, -1)])),
                        ]),
                        _: 1,
                      }
                    ),
                    n(
                      f(x),
                      {
                        variant: `solid`,
                        disabled: !P.value || !V.value,
                        onClick: q,
                      },
                      {
                        default: d(() => [
                          ...(a[5] || (a[5] = [l(` Insert Embed `, -1)])),
                        ]),
                        _: 1,
                      },
                      8,
                      [`disabled`]
                    ),
                  ]),
                ]),
                _: 1,
              },
              8,
              [`modelValue`]
            ),
          ])
        )
      );
    },
  });
export { M as default };
//# sourceMappingURL=InsertIframe-CnII1VBo.js.map
