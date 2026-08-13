<template>
  <FileUploader>
    <template #default="{ file, uploading, progress, openFileSelector }">
      <!-- Shaped as a TextInput sm/subtle, the size and variant every other
           control on this form uses; the whole row opens the picker, so there is
           no button competing with the field it sits in. -->
      <button
        type="button"
        class="flex h-7 w-full items-center gap-2 rounded border border-[--surface-gray-2] bg-surface-gray-2 px-2 text-base hover:border-outline-elevation-2 hover:bg-surface-gray-3"
        :class="file ? 'text-ink-gray-8' : 'text-ink-gray-4'"
        @click="openFileSelector"
      >
        <FeatherIcon name="upload" class="size-4 shrink-0 text-ink-gray-5" />
        <span class="min-w-0 flex-1 truncate text-left">
          {{ statusLabel(file, uploading, progress) }}
        </span>
      </button>
    </template>
  </FileUploader>
</template>

<script setup lang="ts">
// Attachment row for the KB new-ticket form. Wraps frappe-ui's FileUploader so
// the designed row can use its slot props: Studio only forwards slot props to
// *named* slots, so a plain block tree in the default slot could never reach
// `openFileSelector` or the chosen `file`.
import { FeatherIcon, FileUploader } from "frappe-ui";

function statusLabel(
  file: { name?: string } | null,
  uploading: boolean,
  progress: number
) {
  if (uploading) return `Uploading ${progress}%`;
  return file?.name || "Choose file";
}
</script>
