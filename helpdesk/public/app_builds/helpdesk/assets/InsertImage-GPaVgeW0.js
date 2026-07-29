import {
  C as e,
  D as t,
  I as n,
  K as r,
  O as i,
  P as a,
  S as o,
  U as s,
  n as c,
  w as l,
  x as u,
  y as d,
  z as f,
} from "./studioRenderer-CDVyqa2z.js";
var p = t({
  __name: `InsertImage`,
  props: { editor: {} },
  setup(t) {
    let p = t,
      m = f(`fileInput`),
      h = s(!1),
      g = s([]);
    function _() {
      var e;
      (e = m.value) == null || e.click();
    }
    function v(e) {
      let t = e.target.files;
      t &&
        t.length > 0 &&
        (t.length === 1
          ? p.editor.chain().focus().uploadImage(t[0]).run()
          : ((g.value = Array.from(t)), (h.value = !0)));
    }
    function y() {
      (h.value = !1), (g.value = []);
    }
    return (s, f) => (
      a(),
      l(
        d,
        null,
        [
          n(s.$slots, `default`, r(i({ onClick: _ }))),
          u(
            `input`,
            {
              ref_key: `fileInput`,
              ref: m,
              type: `file`,
              class: `hidden`,
              onChange: v,
              accept: `image/*`,
              multiple: ``,
            },
            null,
            544
          ),
          h.value
            ? (a(),
              o(
                c,
                {
                  key: 0,
                  mode: `new`,
                  modelValue: h.value,
                  "onUpdate:modelValue": f[0] || (f[0] = (e) => (h.value = e)),
                  files: g.value,
                  "onUpdate:files": f[1] || (f[1] = (e) => (g.value = e)),
                  editor: t.editor,
                  onClose: y,
                },
                null,
                8,
                [`modelValue`, `files`, `editor`]
              ))
            : e(`v-if`, !0),
        ],
        64
      )
    );
  },
});
export { p as default };
//# sourceMappingURL=InsertImage-GPaVgeW0.js.map
