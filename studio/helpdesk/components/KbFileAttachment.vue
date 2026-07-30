<template>
  <FileUploader>
    <template #default="{ file, uploading, progress, openFileSelector }">
      <div
        class="flex h-[42px] items-center gap-2.5 rounded border border-outline-gray-2 bg-surface-white pl-3 pr-2"
      >
        <FeatherIcon name="upload" class="size-4 shrink-0 text-ink-gray-5" />
        <span
          class="flex-1 truncate text-base"
          :class="file ? 'text-ink-gray-8' : 'text-ink-gray-5'"
        >
          {{ statusLabel(file, uploading, progress) }}
        </span>
        <Button size="sm" :loading="uploading" @click="openFileSelector">
          Upload file
        </Button>
      </div>
    </template>
  </FileUploader>
</template>

<script setup lang="ts">
// Attachment row for the KB new-ticket form. Wraps frappe-ui's FileUploader so
// the designed row can use its slot props: Studio only forwards slot props to
// *named* slots, so a plain block tree in the default slot could never reach
// `openFileSelector` or the chosen `file`.
import { Button, FeatherIcon, FileUploader } from "frappe-ui";

function statusLabel(
  file: { name?: string } | null,
  uploading: boolean,
  progress: number
) {
  if (uploading) return `Uploading ${progress}%`;
  return file?.name || "Choose file";
}
</script>
