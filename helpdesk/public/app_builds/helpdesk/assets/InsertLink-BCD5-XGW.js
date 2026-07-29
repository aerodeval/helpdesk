import { D as e, I as t, K as n, O as r } from "./studioRenderer-CDVyqa2z.js";
var i = e({
  __name: `InsertLink`,
  props: { editor: {} },
  setup(e) {
    let i = e;
    function a() {
      i.editor.commands.openLinkEditor();
    }
    return (e, i) => t(e.$slots, `default`, n(r({ onClick: a })));
  },
});
export { i as default };
//# sourceMappingURL=InsertLink-BCD5-XGW.js.map
