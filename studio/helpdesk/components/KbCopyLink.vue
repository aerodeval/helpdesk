<template>
  <!-- Two shapes, one behaviour: a labelled control for a byline, and a bordered icon
       button for a header that has no room for words. -->
  <Tooltip v-if="variant === 'button'" text="Copy link">
    <button
      type="button"
      class="kb-copy-link kb-copy-link--button"
      aria-label="Copy link"
      @click="copy"
    >
      <LucideLink />
    </button>
  </Tooltip>
  <button v-else type="button" class="kb-copy-link" @click="copy">
    <LucideCopy />
    <span>Copy link</span>
  </button>
</template>

<script setup lang="ts">
// A block carries only inline styles, so a :hover shade is impossible in the
// tree — hence a component, which also keeps the copy behaviour next to the
// control that triggers it.
import { Tooltip, toast } from "frappe-ui";
import LucideCopy from "~icons/lucide/copy";
import LucideLink from "~icons/lucide/link";

withDefaults(defineProps<{ variant?: "inline" | "button" }>(), {
  variant: "inline",
});

async function copy() {
  // The address bar already holds the article's permalink.
  const url = window.location.href;
  try {
    // navigator.clipboard is secure-context only and a bench served over plain
    // http isn't one, so fall back the way helpdesk's copyToClipboard does.
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
    } else {
      copyWithSelection(url);
    }
    toast.success("Link copied");
  } catch (error) {
    console.error(error);
    toast.error("Could not copy the link");
  }
}

function copyWithSelection(text: string) {
  const field = document.createElement("input");
  field.value = text;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  try {
    document.execCommand("copy");
  } finally {
    field.remove();
  }
}
</script>

<style scoped>
/* Plain CSS because this app sits outside the bench's Tailwind content globs —
   hover:text-ink-gray-7 never compiles here. */
/* text-sm and a 14px icon: the rest of the byline's type and its clock, so the whole
   line sits on one scale. */
.kb-copy-link {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  line-height: 1.15;
  /* Reads as part of the byline it sits in, not as a link out of the article. */
  color: var(--ink-gray-5);
  cursor: pointer;
  transition: color 150ms ease;
}

.kb-copy-link svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.kb-copy-link:hover {
  color: var(--ink-gray-7);
}

/* Square, bordered, icon only — sized to sit beside a two-line identity block without
   pulling the eye off the name. */
.kb-copy-link--button {
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: 1px solid var(--outline-gray-2);
  border-radius: 8px;
  color: var(--ink-gray-6);
}

.kb-copy-link--button:hover {
  background: var(--surface-gray-2);
  color: var(--ink-gray-8);
}
</style>
