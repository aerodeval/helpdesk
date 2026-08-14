<template>
  <TextEditor
    class="kb-article"
    :content="content"
    :editable="false"
    :extensions="[ComponentUtils]"
    editor-class="prose-sm"
  />
</template>

<script setup lang="ts">
// Article body, rendered exactly the way the agent portal renders it in
// `desk/src/pages/knowledge-base/Article.vue`: a read-only TextEditor, not raw
// HTML. Going through the editor is what gives the article its typography,
// image and table treatment, and code blocks — a plain HTML block only ever
// inherited whatever the page happened to style.
import { Extension } from "@tiptap/core";
import { TextEditor } from "frappe-ui";

withDefaults(defineProps<{ content?: string }>(), { content: "" });

// Copied from `desk/src/tiptap-extensions.ts`. Tiptap drops any attribute its
// schema does not declare, so without these the video loses its controls, images
// lose their dimensions, and — the one that matters here — headings lose the ids
// the page injects for the table of contents.
const ComponentUtils: Extension = Extension.create({
  name: "ComponentUtils",
  addGlobalAttributes() {
    return [
      {
        types: ["video"],
        attributes: {
          controls: {
            default: true,
            parseHTML: (element) => element.getAttribute("controls"),
            renderHTML: () => {
              return { controls: true };
            },
          },
        },
      },
      {
        types: ["image"],
        attributes: {
          height: {
            default: null,
            parseHTML: (element) => element.getAttribute("height"),
            renderHTML: (attributes) => {
              if (!attributes.height) return {};
              return { height: attributes.height };
            },
          },
          width: {
            default: null,
            parseHTML: (element) => element.getAttribute("width"),
            renderHTML: (attributes) => {
              if (!attributes.width) return {};
              return { width: attributes.width };
            },
          },
        },
      },
      {
        types: ["heading"],
        attributes: {
          id: {
            default: null,
            parseHTML: (element) => element.getAttribute("id"),
            renderHTML: (attributes) => {
              if (!attributes.id) {
                return {};
              }
              return { id: attributes.id };
            },
          },
        },
      },
      {
        types: ["paragraph"],
        attributes: {
          class: {
            default: null,
            parseHTML: (element) => element.getAttribute("class"),
            renderHTML: (attributes) => {
              if (!attributes.class) return {};
              return { class: attributes.class };
            },
          },
        },
      },
      {
        types: ["table"],
        attributes: {
          style: {
            default: null,
            parseHTML: (el) => el.getAttribute("style"),
            renderHTML: () => ({
              style:
                "border-collapse: collapse; width: 100%; border: 1px solid #d1d5db;",
            }),
          },
        },
      },
      {
        types: ["tableRow"],
        attributes: {
          style: {
            default: null,
            parseHTML: (el) => el.getAttribute("style"),
            renderHTML: () => ({ style: "border: 1px solid #d1d5db;" }),
          },
        },
      },
      {
        types: ["tableCell", "tableHeader"],
        attributes: {
          style: {
            default: null,
            parseHTML: (el) => el.getAttribute("style"),
            renderHTML: () => ({
              style:
                "border: 1px solid #d1d5db; padding: 6px 8px; vertical-align: top; text-align: left;",
            }),
          },
        },
      },
    ];
  },
});
</script>

<style scoped>
/* The desk widens the same editor with `max-w-[unset]`. Written as CSS rather
   than that utility because this app sits outside the bench's Tailwind content
   globs, where an arbitrary value no other bundled file uses never compiles. */
.kb-article :deep(.ProseMirror) {
  max-width: none;
}
</style>
