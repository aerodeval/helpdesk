import {
  F as e,
  G as t,
  I as n,
  K as r,
  L as i,
  O as a,
  P as o,
  S as s,
  V as c,
  l,
  m as u,
  u as d,
  w as f,
  x as p,
  y as m,
} from "./studioRenderer-CDVyqa2z.js";
var h = {
    name: `FontColor`,
    props: [`editor`],
    components: { Popover: d, Tooltip: l },
    methods: {
      setBackgroundColor(e) {
        e.name == `Default`
          ? this.editor.chain().focus().unsetHighlight().run()
          : this.editor
              .chain()
              .focus()
              .toggleHighlightByName(e.name.toLowerCase())
              .run();
      },
      setForegroundColor(e) {
        e.name == `Default`
          ? this.editor.chain().focus().unsetColor().run()
          : this.editor
              .chain()
              .focus()
              .setColorByName(e.name.toLowerCase())
              .run();
      },
    },
    computed: {
      foregroundColors() {
        return [
          { name: `Default`, class: `text-ink-gray-9` },
          { name: `Red`, class: `text-red-600 dark:text-dark-red-400` },
          {
            name: `Orange`,
            class: `text-orange-600 dark:text-dark-orange-400`,
          },
          {
            name: `Yellow`,
            class: `text-yellow-600 dark:text-dark-yellow-400`,
          },
          { name: `Green`, class: `text-green-600 dark:text-dark-green-400` },
          { name: `Teal`, class: `text-teal-600 dark:text-dark-teal-400` },
          { name: `Cyan`, class: `text-cyan-600 dark:text-dark-cyan-400` },
          { name: `Blue`, class: `text-blue-600 dark:text-dark-blue-400` },
          {
            name: `Purple`,
            class: `text-purple-600 dark:text-dark-purple-400`,
          },
          { name: `Pink`, class: `text-pink-600 dark:text-dark-pink-400` },
          { name: `Gray`, class: `text-gray-600 dark:text-dark-gray-400` },
        ];
      },
      backgroundColors() {
        return [
          { name: `Default`, class: `border-outline-elevation-2` },
          {
            name: `Red`,
            class: `bg-red-100 dark:bg-dark-red-800 border-transparent`,
          },
          {
            name: `Orange`,
            class: `bg-orange-100 dark:bg-dark-orange-800 border-transparent`,
          },
          {
            name: `Yellow`,
            class: `bg-yellow-100 dark:bg-dark-yellow-800 border-transparent`,
          },
          {
            name: `Green`,
            class: `bg-green-100 dark:bg-dark-green-800 border-transparent`,
          },
          {
            name: `Teal`,
            class: `bg-teal-100 dark:bg-dark-teal-800 border-transparent`,
          },
          {
            name: `Cyan`,
            class: `bg-cyan-100 dark:bg-dark-cyan-800 border-transparent`,
          },
          {
            name: `Blue`,
            class: `bg-blue-100 dark:bg-dark-blue-800 border-transparent`,
          },
          {
            name: `Purple`,
            class: `bg-purple-100 dark:bg-dark-purple-800 border-transparent`,
          },
          {
            name: `Pink`,
            class: `bg-pink-100 dark:bg-dark-pink-800 border-transparent`,
          },
          {
            name: `Gray`,
            class: `bg-gray-100 dark:bg-dark-gray-800 border-transparent`,
          },
        ];
      },
    },
  },
  g = { class: `p-2` },
  _ = { class: `mt-1 grid grid-cols-6 gap-1` },
  v = [`aria-label`, `onClick`],
  y = { class: `mt-1 grid grid-cols-6 gap-1` },
  b = [`aria-label`, `onClick`];
function x(l, u, d, h, x, S) {
  let C = i(`Tooltip`),
    w = i(`Popover`);
  return (
    o(),
    s(
      w,
      { transition: `default` },
      {
        target: c(({ togglePopover: e, isOpen: t }) => [
          n(l.$slots, `default`, r(a({ onClick: () => e(), isActive: t }))),
        ]),
        "body-main": c(() => [
          p(`div`, g, [
            u[0] ||
              (u[0] = p(
                `div`,
                { class: `text-sm text-ink-gray-7` },
                `Text Color`,
                -1
              )),
            p(`div`, _, [
              (o(!0),
              f(
                m,
                null,
                e(
                  S.foregroundColors,
                  (e) => (
                    o(),
                    s(
                      C,
                      { class: `flex`, key: e.name, text: e.name },
                      {
                        default: c(() => [
                          p(
                            `button`,
                            {
                              "aria-label": e.name,
                              class: t([
                                `flex h-5 w-5 items-center justify-center rounded border text-base`,
                                e.class,
                              ]),
                              onClick: (t) => S.setForegroundColor(e),
                            },
                            ` A `,
                            10,
                            v
                          ),
                        ]),
                        _: 2,
                      },
                      1032,
                      [`text`]
                    )
                  )
                ),
                128
              )),
            ]),
            u[1] ||
              (u[1] = p(
                `div`,
                { class: `mt-2 text-sm text-ink-gray-7` },
                `Background Color`,
                -1
              )),
            p(`div`, y, [
              (o(!0),
              f(
                m,
                null,
                e(
                  S.backgroundColors,
                  (e) => (
                    o(),
                    s(
                      C,
                      { class: `flex`, key: e.name, text: e.name },
                      {
                        default: c(() => [
                          p(
                            `button`,
                            {
                              "aria-label": e.name,
                              class: t([
                                `flex h-5 w-5 items-center justify-center rounded border text-base text-ink-gray-9`,
                                e.class,
                              ]),
                              onClick: (t) => S.setBackgroundColor(e),
                            },
                            ` A `,
                            10,
                            b
                          ),
                        ]),
                        _: 2,
                      },
                      1032,
                      [`text`]
                    )
                  )
                ),
                128
              )),
            ]),
          ]),
        ]),
        _: 3,
      }
    )
  );
}
var S = u(h, [[`render`, x]]);
export { S as default };
//# sourceMappingURL=FontColor-q75bxN5U.js.map
