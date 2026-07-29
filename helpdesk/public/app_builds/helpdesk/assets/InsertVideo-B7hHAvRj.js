import { D as e, I as t, K as n, O as r } from "./studioRenderer-CDVyqa2z.js";
var i = e({
  __name: `InsertVideo`,
  props: { editor: {} },
  setup(e) {
    let i = e;
    function a() {
      i.editor.chain().focus().selectAndUploadVideo().run();
    }
    return (e, i) => t(e.$slots, `default`, n(r({ onClick: a })));
  },
});
export { i as default };
//# sourceMappingURL=InsertVideo-B7hHAvRj.js.map
