<template>
  <!-- The engine filters and ranks, so fui's own filter is off. -->
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
        <LucideSearch class="size-4 shrink-0 text-ink-gray-6" />
        <!-- Not a button: removal is backspace-only, advertised by esc's label. -->
        <Badge v-if="context" class="max-w-[30%] shrink-0">
          <span class="shrink-0 text-ink-gray-7">{{ context.label }}</span>
          <span class="shrink-0 text-ink-gray-4">⋅</span>
          <span class="truncate text-ink-gray-5">{{
            context.title || __("Ticket")
          }}</span>
        </Badge>
        <Button
          v-if="stepLabel"
          variant="ghost"
          class="shrink-0"
          :label="stepLabel"
          :icon-right="LucideChevronRight"
          @mousedown.prevent
          @click="back"
        />
      </template>
      <template v-if="isLoading" #suffix>
        <Spinner size="md" class="shrink-0 text-ink-gray-5" />
      </template>
    </CommandPaletteInput>

    <CommandPaletteList>
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

    <!-- Stays mounted as the live region; an empty text node keeps fui's fallback out. -->
    <CommandPaletteEmpty>{{ emptyMessage }}</CommandPaletteEmpty>

    <CommandPaletteFooter>
      <span class="flex items-center gap-1.5 text-xs text-ink-gray-4">
        <ShortcutKey keys="↑ ↓" />
        {{ __("Navigate") }}
      </span>
      <span class="flex items-center gap-1.5 text-xs text-ink-gray-4">
        <ShortcutKey keys="↵" />
        {{ __("Select") }}
      </span>
      <span
        v-if="stepLabel"
        class="flex items-center gap-1.5 text-xs text-ink-gray-4"
      >
        <ShortcutKey keys="⌫" />
        {{ __("Back") }}
      </span>
      <span class="ms-auto flex items-center gap-1.5 text-xs text-ink-gray-4">
        <ShortcutKey keys="esc" />
        {{ escapeLabel }}
      </span>
    </CommandPaletteFooter>
  </CommandPalette>
</template>

<script setup lang="ts">
import { __ } from "@/translation";
import { Badge, Button, Spinner, useKeyboardShortcut } from "frappe-ui";
import {
  CommandPalette,
  CommandPaletteEmpty,
  CommandPaletteFooter,
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

// A command owns focus after it runs; only a dismissal returns it to the opener.
let commandRan = false;
// Reka's pointerleave drops the highlight but fui's `active` keeps the old row.
let isRowHighlighted = () => false;

// Reaches reka state fui hides: keeps a live row highlighted, skips refocus after a run.
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
      // fui nulls it itself when the list empties; only refill a non-empty list.
      if (groups.value.some((group) => group.items.length))
        listbox.highlightFirstItem();
    });
    isRowHighlighted = () => !!listbox.highlightedElement.value?.isConnected;
    watch(isOpen, (open) => {
      if (open) return;
      if (commandRan) dialog.triggerElement.value = undefined;
      commandRan = false;
    });
    return () => null;
  },
});

const stepLabel = computed(() => (depth.value ? breadcrumb.value.at(-1) : ""));

/** Per-level: an empty drill-down is not "No commands found". */
const emptyMessage = computed(() => {
  if (isLoading.value) return "";
  if (query.value) return __('No results for "{0}"', query.value);
  if (stepLabel.value) return __("Nothing left in {0}", stepLabel.value);
  return __("No commands found");
});

// Esc peels one layer at a time, so the label tracks what it will actually do.
const escapeLabel = computed(() => {
  if (query.value) return __("Clear");
  if (stepLabel.value) return __("Back");
  return context.value ? __("Remove context") : __("Close");
});

const placeholder = computed(() =>
  stepLabel.value ? __("Search…") : __("Search tickets or type a command…")
);

/** The engine decides between drilling, toggling and closing, so fui never closes. */
function onSelect(
  value: CommandPaletteValue,
  event: CommandPaletteSelectEvent
) {
  event.preventDefault();
  const command = value as Command;
  run(command);
  // Only a leaf closes, and synchronously, so open-state is the outcome.
  commandRan = !isOpen.value;
}

function onKeydown(event: KeyboardEvent, active: CommandPaletteValue) {
  if (event.key === "Escape") peelOnEscape(event);
  else if (event.key === "Backspace" && !query.value) peelOnBackspace(event);
  else if (event.key === "ArrowRight") drillIn(event, active as Command);
}

/** Query, then step, then context; only the last press reaches fui's Dialog and closes. */
function peelOnEscape(event: KeyboardEvent) {
  if (!query.value && !depth.value && !context.value) return;
  event.preventDefault();
  event.stopPropagation();
  if (query.value) onQueryChange("");
  else if (depth.value) back();
  else dismissContext();
}

/** One layer per press, outermost last: step, then context. */
function peelOnBackspace(event: KeyboardEvent) {
  if (depth.value) back();
  else if (context.value) dismissContext();
  else return;
  event.preventDefault();
}

/** → mirrors ⌫: only at the caret's end so editing stays native, and only on parents. */
function drillIn(event: KeyboardEvent, command?: Command) {
  const input = event.target as HTMLInputElement;
  const modified =
    event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;
  const caretAtEnd =
    input.selectionStart === input.selectionEnd &&
    input.selectionEnd === input.value.length;
  if (modified || !caretAtEnd || !isRowHighlighted() || !command?.children)
    return;
  event.preventDefault();
  run(command);
}

// Reset on open, not close: resetting on close revived the dismissed chip mid-fade.
watch(isOpen, (open) => {
  if (open) resetPalette();
});

// frappe-ui's useKeyboardShortcut: the local one suppresses bindings in inputs
// and dialogs, so Cmd+K couldn't open from a filter box. ProseMirror keeps its
// own Mod-k (insert link), so bow out there. `allowInDialog` is only for closing
// from the palette's own dialog: opening over another one (Settings) would stack
// the palette, and the popovers its commands open, above that dialog.
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
