<template>
  <CommandPalette
    v-slot="{ active }"
    v-model:open="isOpen"
    :query="query"
    :filterable="false"
    :title="__('Command Palette')"
    @update:query="onQueryChange"
    @select="onSelect"
  >
    <RekaBridge />

    <div v-if="context" class="px-4.5 pt-3">
      <Badge class="max-w-[30%]">
        <span class="shrink-0 text-ink-gray-7">{{ context.label }}</span>
        <span class="shrink-0 text-ink-gray-4">⋅</span>
        <span class="truncate text-ink-gray-5">{{
          context.title || __("Ticket")
        }}</span>
      </Badge>
    </div>

    <CommandPaletteInput
      :placeholder="placeholder"
      :aria-label="
        context
          ? __('Search commands for {0}', [context.label])
          : __('Search commands')
      "
      spellcheck="false"
      @keydown="onKeydown($event, active)"
    >
      <template #prefix>
        <Button
          v-if="stepLabel"
          variant="ghost"
          class="shrink-0"
          :label="stepLabel"
          :icon-right="LucideChevronRight"
          @mousedown.prevent
          @click="back"
        />
        <LucideSearch class="size-4 shrink-0 text-ink-gray-6" />
      </template>
      <template v-if="isLoading" #suffix>
        <Spinner size="md" class="shrink-0 text-ink-gray-5" />
      </template>
    </CommandPaletteInput>

    <CommandPaletteList class="scroll-py-2">
      <CommandPaletteGroup
        v-for="(group, groupIndex) in groups"
        :key="`${depth}:${groupIndex}:${group.title}`"
        :label="group.title || undefined"
      >
        <CommandPaletteRow
          v-for="command in group.items"
          :key="`${group.title}:${command.id}`"
          :command="command"
        />
      </CommandPaletteGroup>
    </CommandPaletteList>

    <CommandPaletteEmpty>{{ emptyMessage }}</CommandPaletteEmpty>

    <div
      class="mt-2 flex items-center justify-between border-t border-outline-gray-1 px-2.5 py-2 text-xs text-ink-gray-6 dark:border-outline-gray-2"
    >
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-1">
          <ShortcutKey keys="↓ ↑" />
          <span class="ms-1">{{ __("to navigate") }}</span>
        </div>
        <div class="flex items-center gap-1">
          <ShortcutKey keys="↵" />
          <span class="ms-1">{{ __("to select") }}</span>
        </div>
        <div class="flex items-center gap-1">
          <ShortcutKey keys="esc" />
          <span class="ms-1">{{ escapeLabel }}</span>
        </div>
      </div>
      <div class="flex items-center gap-1">
        <ShortcutKey :keys="`${metaIcon} K`" />
        <span class="ms-1">{{ __("to open") }}</span>
      </div>
    </div>
  </CommandPalette>
</template>

<script setup lang="ts">
import { __ } from "@/translation";
import { useDevice } from "@/composables";
import { Badge, Button, Spinner, useKeyboardShortcut } from "frappe-ui";
import {
  CommandPalette,
  CommandPaletteEmpty,
  CommandPaletteGroup,
  CommandPaletteInput,
  CommandPaletteList,
  type CommandPaletteSelectEvent,
  type CommandPaletteValue,
} from "frappe-ui/experimental";
import { injectDialogRootContext, injectListboxRootContext } from "reka-ui";
import { computed, defineComponent, watch } from "vue";

import ShortcutKey from "@helpdesk/shared/ShortcutKey.vue";
import LucideChevronRight from "~icons/lucide/chevron-right";
import LucideSearch from "~icons/lucide/search";
import CommandPaletteRow from "./CommandPaletteRow.vue";
import type { Command } from "./paletteTypes";
import {
  back,
  breadcrumb,
  closePalette,
  context,
  depth,
  dismissContext,
  groups,
  isLoading,
  isOpen,
  onQueryChange,
  openPalette,
  query,
  resetPalette,
  run,
} from "./useCommandPalette";

const { metaIcon } = useDevice();

let commandRan = false;

// Reka state fui hides: keep a row highlighted, skip opener refocus after a run.
const RekaBridge = defineComponent({
  setup() {
    const listbox = injectListboxRootContext();
    const dialog = injectDialogRootContext();
    watch(
      groups,
      () => {
        if (!listbox.highlightedElement.value?.isConnected)
          listbox.highlightFirstItem();
      },
      { flush: "post" }
    );
    watch(listbox.highlightedElement, (element, previous) => {
      if (element || !previous || !isOpen.value) return;
      if (groups.value.some((group) => group.items.length))
        listbox.highlightFirstItem();
    });
    watch(isOpen, (open) => {
      if (open) return;
      if (commandRan) dialog.triggerElement.value = undefined;
      commandRan = false;
    });
    return () => null;
  },
});

const stepLabel = computed(() => (depth.value ? breadcrumb.value.at(-1) : ""));

const emptyMessage = computed(() => {
  if (isLoading.value) return "";
  if (query.value) return __('No results for "{0}"', query.value);
  if (stepLabel.value) return __("Nothing left in {0}", stepLabel.value);
  return __("No commands found");
});

const escapeLabel = computed(() => {
  if (query.value) return __("to clear");
  if (stepLabel.value) return __("to go back");
  return context.value ? __("to remove context") : __("to close");
});

const placeholder = computed(() =>
  stepLabel.value ? __("Search…") : __("Search tickets or type a command…")
);

function onSelect(
  value: CommandPaletteValue,
  event: CommandPaletteSelectEvent
) {
  // run() decides drill, toggle or close, so fui never closes.
  event.preventDefault();
  const command = value as Command;
  run(command);
  commandRan = !isOpen.value;
}

function onKeydown(event: KeyboardEvent, active: CommandPaletteValue) {
  if (event.key === "Escape") peelOnEscape(event);
  else if (event.key === "Backspace" && !query.value) peelOnBackspace(event);
  else if (event.key === "ArrowRight") drillIn(event, active as Command);
}

function peelOnEscape(event: KeyboardEvent) {
  if (!query.value && !depth.value && !context.value) return;
  event.preventDefault();
  event.stopPropagation();
  if (query.value) onQueryChange("");
  else if (depth.value) back();
  else dismissContext();
}

function peelOnBackspace(event: KeyboardEvent) {
  if (depth.value) back();
  else if (context.value) dismissContext();
  else return;
  event.preventDefault();
}

function drillIn(event: KeyboardEvent, command?: Command) {
  const input = event.target as HTMLInputElement;
  const modified =
    event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;
  const caretAtEnd =
    input.selectionStart === input.selectionEnd &&
    input.selectionEnd === input.value.length;
  if (modified || !caretAtEnd || !command?.children) return;
  event.preventDefault();
  run(command);
}

// Reset on open: on close it revived the chip mid-fade.
watch(isOpen, (open) => {
  if (open) resetPalette();
});

// ProseMirror owns Mod-k; never open over another dialog.
useKeyboardShortcut({
  combo: "Mod+K",
  description: __("Open command palette"),
  group: __("General"),
  allowInInput: true,
  allowInDialog: true,
  enabled: () => {
    const focused = document.activeElement;
    if (focused?.closest?.(".ProseMirror")) return false;
    return isOpen.value || !focused?.closest?.('[role="dialog"]');
  },
  handler: () => (isOpen.value ? closePalette() : openPalette()),
});
</script>
