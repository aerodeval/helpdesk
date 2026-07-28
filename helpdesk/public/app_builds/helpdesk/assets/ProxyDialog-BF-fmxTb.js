import {
  C as e,
  D as t,
  I as n,
  L as r,
  N as i,
  O as a,
  P as o,
  R as s,
  _ as c,
  b as l,
  c as u,
  f as d,
  g as f,
  h as p,
  j as m,
  k as h,
  l as g,
  m as _,
  o as v,
  p as y,
  u as b,
  v as x,
  x as S,
  y as C,
  z as w,
} from "./studioRenderer-CDp9bQsF.js";
var T = { key: 1, class: `bg-surface-elevation-1 px-4 pb-6 pt-5 sm:px-6` },
  E = { class: `flex` },
  D = { class: `w-full flex-1` },
  O = { key: 1, class: `mb-6 flex items-center justify-between` },
  k = { class: `flex flex-1 items-center space-x-2` },
  A = { class: `flex-1` },
  j = { key: 0, class: `text-2xl-semibold leading-6 text-ink-gray-8` },
  M = { key: 0 },
  N = { key: 0 },
  P = { class: `text-p-base text-ink-gray-7` },
  F = { key: 2, class: `px-4 pb-7 pt-4 sm:px-6` },
  I = { key: 3 },
  L = l({
    __name: `ProxyDialog`,
    props: {
      open: { type: Boolean, default: void 0 },
      modelValue: { type: Boolean, default: void 0 },
      options: {},
      title: {},
      message: {},
      icon: {},
      size: { default: void 0 },
      position: { default: void 0 },
      paddingTop: {},
      actions: {},
      disableOutsideClickToClose: { type: Boolean, default: void 0 },
      dismissible: { type: Boolean, default: !0 },
      showCloseButton: { type: Boolean, default: !0 },
      bare: { type: Boolean, default: !1 },
    },
    emits: [`update:open`, `update:modelValue`, `close`, `after-leave`],
    setup(l, { expose: L, emit: R }) {
      let z = l,
        B = R,
        V = m(),
        H = y(() => {
          var e, t, n, r, i, a, o, s, c, l;
          let u = z.options || {};
          return {
            title: (e = z.title) == null ? u.title : e,
            message: (t = z.message) == null ? u.message : t,
            icon: (n = z.icon) == null ? u.icon : n,
            size: (r = (i = z.size) == null ? u.size : i) == null ? `lg` : r,
            position:
              (a = (o = z.position) == null ? u.position : o) == null
                ? `center`
                : a,
            paddingTop: (s = z.paddingTop) == null ? u.paddingTop : s,
            actions:
              (c = (l = z.actions) == null ? u.actions : l) == null ? [] : c,
            showCloseButton: z.showCloseButton,
            bare: z.bare,
          };
        });
      y(() => (z.disableOutsideClickToClose ? !1 : z.dismissible !== !1));
      let U = y(
          () =>
            ({
              xs: `max-w-xs`,
              sm: `max-w-sm`,
              md: `max-w-md`,
              lg: `max-w-lg`,
              xl: `max-w-xl`,
              "2xl": `max-w-2xl`,
              "3xl": `max-w-3xl`,
              "4xl": `max-w-4xl`,
              "5xl": `max-w-5xl`,
              "6xl": `max-w-6xl`,
              "7xl": `max-w-7xl`,
            }[H.value.size] || `max-w-lg`)
        ),
        W = y({
          get() {
            return z.open === void 0 ? !!z.modelValue : !!z.open;
          },
          set(e) {
            B(`update:open`, e), B(`update:modelValue`, e), e || B(`close`);
          },
        });
      function G() {
        W.value = !1;
      }
      let K = y(() => {
          let e = H.value.icon;
          return e ? (typeof e == `string` ? { name: e } : e) : null;
        }),
        q = y(() => {
          let e = K.value;
          return e
            ? e.theme
              ? e.theme
              : e.appearance
              ? {
                  warning: `yellow`,
                  info: `blue`,
                  danger: `red`,
                  success: `green`,
                }[e.appearance]
              : null
            : null;
        }),
        J = y(() => {
          let e = q.value;
          return e
            ? {
                yellow: `bg-surface-amber-2`,
                blue: `bg-surface-blue-2`,
                red: `bg-surface-red-2`,
                green: `bg-surface-green-2`,
              }[e]
            : `bg-surface-gray-2`;
        }),
        Y = y(() => {
          let e = q.value;
          return e
            ? {
                yellow: `text-ink-amber-6`,
                blue: `text-ink-blue-6`,
                red: `text-ink-red-8`,
                green: `text-ink-green-6`,
              }[e]
            : `text-ink-gray-5`;
        });
      y(() =>
        H.value.paddingTop
          ? ``
          : { center: `justify-center`, top: `pt-[20vh]` }[H.value.position] ||
            `justify-center`
      ),
        y(() => (H.value.paddingTop ? { paddingTop: H.value.paddingTop } : {}));
      let X = y(() => {
          if (H.value.bare) return [];
          let e = H.value.actions;
          return e != null && e.length
            ? e.map((e) => {
                let t = o(
                  g(
                    g({}, e),
                    {},
                    {
                      loading: !1,
                      onClick: e.onClick
                        ? b(function* () {
                            t.loading = !0;
                            try {
                              let t = () => {
                                G();
                              };
                              (t.close = G), yield e.onClick(t);
                            } finally {
                              t.loading = !1;
                            }
                          })
                        : G,
                    }
                  )
                );
                return t;
              })
            : [];
        }),
        Z = y(
          () =>
            X.value.length === 1 && [`xs`, `sm`, `md`].includes(H.value.size)
        ),
        Q = y(() =>
          H.value.bare ? !1 : !!(V.title || V[`body-title`] || H.value.title)
        );
      function $(e) {
        return e && e.startsWith(`lucide-`);
      }
      return (
        L({ close: G }),
        (o, l) => (
          t(),
          c(
            `div`,
            {
              class: r([
                `dialog-content my-8 inline-block w-full transform overflow-hidden rounded-xl bg-surface-elevation-1 text-start align-middle shadow-xl focus-visible:outline-none`,
                U.value,
              ]),
            },
            [
              f(` bare: no chrome, render default slot directly `),
              H.value.bare
                ? h(o.$slots, `default`, { key: 0, close: G })
                : o.$slots.body
                ? (t(),
                  c(
                    d,
                    { key: 1 },
                    [
                      f(
                        " legacy `#body` slot: full layout override (deprecated) "
                      ),
                      h(o.$slots, `body`),
                    ],
                    2112
                  ))
                : (t(),
                  c(
                    d,
                    { key: 2 },
                    [
                      f(
                        " legacy `#body-main`: full middle override (deprecated) "
                      ),
                      o.$slots[`body-main`]
                        ? h(o.$slots, `body-main`, { key: 0 })
                        : (t(),
                          c(`div`, T, [
                            _(`div`, E, [
                              _(`div`, D, [
                                f(" legacy `#body-header` "),
                                o.$slots[`body-header`]
                                  ? h(o.$slots, `body-header`, { key: 0 })
                                  : Q.value
                                  ? (t(),
                                    c(`div`, O, [
                                      _(`div`, k, [
                                        K.value
                                          ? (t(),
                                            c(
                                              `div`,
                                              {
                                                key: 0,
                                                class: r([
                                                  `flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full`,
                                                  J.value,
                                                ]),
                                              },
                                              [
                                                $(K.value.name)
                                                  ? (t(),
                                                    c(
                                                      `span`,
                                                      {
                                                        key: 0,
                                                        class: r([
                                                          K.value.name,
                                                          `size-4`,
                                                          Y.value,
                                                        ]),
                                                        "aria-hidden": `true`,
                                                      },
                                                      null,
                                                      2
                                                    ))
                                                  : (t(),
                                                    p(
                                                      n(u),
                                                      {
                                                        key: 1,
                                                        name: K.value.name,
                                                        class: r([
                                                          `h-4 w-4`,
                                                          Y.value,
                                                        ]),
                                                        "aria-hidden": `true`,
                                                      },
                                                      null,
                                                      8,
                                                      [`name`, `class`]
                                                    )),
                                              ],
                                              2
                                            ))
                                          : f(`v-if`, !0),
                                        _(`header`, A, [
                                          h(
                                            o.$slots,
                                            `title`,
                                            { close: G },
                                            () => [
                                              h(
                                                o.$slots,
                                                `body-title`,
                                                {},
                                                () => [
                                                  H.value.title
                                                    ? (t(),
                                                      c(
                                                        `h3`,
                                                        j,
                                                        w(H.value.title),
                                                        1
                                                      ))
                                                    : f(`v-if`, !0),
                                                ]
                                              ),
                                            ]
                                          ),
                                        ]),
                                      ]),
                                      H.value.showCloseButton
                                        ? (t(),
                                          c(`div`, M, [
                                            C(
                                              n(v),
                                              {
                                                variant: `ghost`,
                                                label: `Close`,
                                                onClick: G,
                                              },
                                              {
                                                icon: i(() => [
                                                  ...(l[0] ||
                                                    (l[0] = [
                                                      _(
                                                        `span`,
                                                        {
                                                          class: `lucide-x size-4 text-ink-gray-9`,
                                                        },
                                                        null,
                                                        -1
                                                      ),
                                                    ])),
                                                ]),
                                                _: 1,
                                              }
                                            ),
                                          ]))
                                        : f(`v-if`, !0),
                                    ]))
                                  : f(`v-if`, !0),
                                h(o.$slots, `body-content`, {}, () => [
                                  h(o.$slots, `default`, { close: G }, () => [
                                    H.value.message
                                      ? (t(),
                                        c(`div`, N, [
                                          _(`p`, P, w(H.value.message), 1),
                                        ]))
                                      : f(`v-if`, !0),
                                  ]),
                                ]),
                              ]),
                            ]),
                          ])),
                      X.value.length || o.$slots.actions
                        ? (t(),
                          c(`div`, F, [
                            h(
                              o.$slots,
                              `actions`,
                              s(S({ close: G, actions: X.value })),
                              () => [
                                _(
                                  `div`,
                                  {
                                    class: r(
                                      Z.value ? `` : `flex justify-end gap-2`
                                    ),
                                  },
                                  [
                                    (t(!0),
                                    c(
                                      d,
                                      null,
                                      a(
                                        X.value,
                                        (r) => (
                                          t(),
                                          p(
                                            n(v),
                                            e(
                                              {
                                                key: r.label,
                                                class: Z.value ? `w-full` : ``,
                                                disabled: r.disabled,
                                              },
                                              { ref_for: !0 },
                                              r
                                            ),
                                            {
                                              default: i(() => [
                                                x(w(r.label), 1),
                                              ]),
                                              _: 2,
                                            },
                                            1040,
                                            [`class`, `disabled`]
                                          )
                                        )
                                      ),
                                      128
                                    )),
                                  ],
                                  2
                                ),
                              ]
                            ),
                          ]))
                        : f(`v-if`, !0),
                    ],
                    64
                  )),
              f(` close button when auto-header is suppressed `),
              H.value.showCloseButton &&
              !Q.value &&
              !H.value.bare &&
              !o.$slots.body &&
              !o.$slots[`body-header`]
                ? (t(),
                  c(`div`, I, [
                    C(
                      n(v),
                      {
                        class: `absolute right-4 top-4 z-10`,
                        variant: `ghost`,
                        label: `Close`,
                        onClick: G,
                      },
                      {
                        icon: i(() => [
                          ...(l[1] ||
                            (l[1] = [
                              _(
                                `span`,
                                { class: `lucide-x size-4 text-ink-gray-9` },
                                null,
                                -1
                              ),
                            ])),
                        ]),
                        _: 1,
                      }
                    ),
                  ]))
                : f(`v-if`, !0),
            ],
            2
          )
        )
      );
    },
  });
export { L as default };
//# sourceMappingURL=ProxyDialog-BF-fmxTb.js.map
