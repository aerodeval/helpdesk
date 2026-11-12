<template>
  <div class="flex flex-col gap-3">
    <SettingsHeading
      :title="__('Link columns')"
      :description="
        __(
          'Group links under a heading. Each column shows side by side in the footer.'
        )
      "
    />
    <div class="rounded-5 border border-outline-gray-2 px-1">
      <details
        v-for="(column, index) in columns"
        :key="index"
        class="group border-b border-outline-gray-1 py-1 last:border-b-0"
      >
        <summary
          class="flex h-11 cursor-pointer list-none items-center gap-2.5 rounded-4 pl-2 pr-1.5 hover:bg-surface-gray-1 sm:h-10 [&::-webkit-details-marker]:hidden"
        >
          <LucideChevronRight
            class="size-4 shrink-0 text-ink-gray-6 transition-transform group-open:rotate-90 motion-reduce:transition-none"
          />
          <span class="min-w-0 flex-1 truncate text-base text-ink-gray-8">
            {{ column.title || __("Untitled") }}
          </span>
          <span class="shrink-0 text-base text-ink-gray-5">
            {{ countLabel(column.links.length, __("1 link"), __("{0} links")) }}
          </span>
          <!-- prevent: opening the menu must not toggle the row -->
          <Dropdown
            align="end"
            :options="columnOptions(index)"
            @update:open="(open) => open && (isConfirmingDelete = false)"
          >
            <Button
              variant="ghost"
              icon="lucide-more-horizontal"
              :label="__('Options for {0}', [column.title || __('Untitled')])"
              @click.prevent
            />
          </Dropdown>
        </summary>
        <!-- pl-8: starts under the title, past the chevron -->
        <div class="flex flex-col gap-3 pb-2 pl-8 pr-1.5 pt-1">
          <TextInput
            v-model="column.title"
            class="w-60"
            :aria-label="__('Column title')"
            :placeholder="__('Company')"
          />
          <LinkTable v-model="column.links" />
        </div>
      </details>
      <div
        v-if="!columns.length"
        class="flex min-h-11 items-center justify-center px-3 text-center text-p-base text-ink-gray-6 sm:min-h-10"
      >
        {{ __("No columns added yet.") }}
      </div>
    </div>
    <Button
      class="self-start"
      variant="subtle"
      icon-left="lucide-plus"
      :label="__('Add column')"
      :disabled="columns.length >= MAX_FOOTER_COLUMNS"
      @click="columns.push({ title: '', links: [] })"
    />
  </div>
</template>

<script setup lang="ts">
import { Button, Dropdown, TextInput } from "frappe-ui";
import { ref } from "vue";
import LucideChevronRight from "~icons/lucide/chevron-right";
import { type FooterColumn, MAX_FOOTER_COLUMNS } from "../knowledgeBaseFooter";
import { __ } from "../translation";
import { ConfirmDelete, countLabel, MoveOptions } from "../utils";
import LinkTable from "./LinkTable.vue";
import SettingsHeading from "./SettingsHeading.vue";

const columns = defineModel<FooterColumn[]>({ required: true });

const isConfirmingDelete = ref(false);

function columnOptions(index: number) {
  return [
    ...MoveOptions(index, columns.value.length, (to) =>
      columns.value.splice(to, 0, ...columns.value.splice(index, 1))
    ),
    ...ConfirmDelete({
      isConfirmingDelete,
      onConfirmDelete: () => columns.value.splice(index, 1),
    }),
  ];
}
</script>
