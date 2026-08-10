<template>
  <button type="button" class="kb-copy-link" @click="copy">
    <LucideCopy class="size-4" />
    <span>Copy link</span>
  </button>
</template>

<script setup lang="ts">
// A block carries only inline styles, so a :hover shade is impossible in the
// tree — hence a component, which also keeps the copy behaviour next to the
// control that triggers it.
import { toast } from "frappe-ui";
import LucideCopy from "~icons/lucide/copy";

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
   hover:text-ink-blue-7 never compiles here. */
.kb-copy-link {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--ink-blue-link);
  cursor: pointer;
  transition: color 150ms ease;
}

.kb-copy-link:hover {
  color: var(--ink-blue-7);
}
</style>
