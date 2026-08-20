<template>
  <button type="button" class="kb-tag">{{ label }}</button>
</template>

<script setup lang="ts">
// A popular-search chip on the knowledge base home. Was frappe-ui's `Badge` in its
// outline variant, which is a label rather than a control: it drew a border and answered
// nothing to the pointer. This is the same violet pill without the outline, and it
// deepens on hover — the hover rule needs a stylesheet of its own, since the app's built
// CSS carries no `hover:bg-surface-violet-*` utility to borrow.
defineProps<{ label?: string }>();
</script>

<style scoped>
.kb-tag {
  border: 0;
  border-radius: 6px;
  padding: 4.5px 6px;
  font-size: 13px;
  line-height: 11.14px;
  cursor: pointer;
  /* The violet ink scale runs light-to-dark, so a chip on a pale fill needs a high step:
     `--ink-violet-2` is #eee8ff, which is the fill itself. */
  color: var(--ink-violet-8, #4f3da1);
  background: var(--surface-violet-2, #eee8ff);
  transition: background-color 0.15s;
  white-space: nowrap;
}

.kb-tag:hover {
  background: var(--surface-violet-3, #dbd5ff);
}

.kb-tag:active {
  background: var(--surface-violet-4, #d2c5fc);
}
</style>
