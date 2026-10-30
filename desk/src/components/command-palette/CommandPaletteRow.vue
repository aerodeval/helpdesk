<template>
  <!-- Keep focus on the input: every key handler is bound there. -->
  <CommandPaletteItem :value="command" @mousedown.prevent>
    <template #prefix>
      <Avatar
        v-if="command.avatar"
        :image="command.avatar.image"
        :label="command.avatar.label"
        size="xs"
        class="me-3 shrink-0"
      />
      <!-- Boxed to the icon's width, so a dot row's title lands on the same axis. -->
      <span
        v-else-if="command.dotClass"
        class="me-3 flex size-4 shrink-0 items-center justify-center"
      >
        <span
          class="size-2 rounded-full bg-current"
          :class="command.dotClass"
        />
      </span>
      <component
        :is="command.icon"
        v-else-if="command.icon"
        v-bind="command.iconProps"
        class="me-3 size-4 shrink-0 text-ink-gray-7"
      />
    </template>

    <!-- Server matches stand out by ink, since every row is already medium weight. -->
    <span
      v-for="(run, index) in runs"
      :key="index"
      :class="{ 'text-ink-gray-6': command.marked && !run.match }"
      >{{ run.text }}</span
    >
    <span v-if="command.titleSuffix" class="ms-1 text-ink-gray-5">{{
      command.titleSuffix
    }}</span>

    <template v-if="hasSuffix" #suffix>
      <span class="flex items-center gap-3">
        <span v-if="command.subtitle" class="text-sm text-ink-gray-5">
          {{ command.subtitle }}
        </span>
        <LucideCheck v-if="command.checked" class="size-4 text-ink-gray-7" />
        <ShortcutKey v-if="command.hint" :keys="shortcutKeys" />
        <LucideChevronRight
          v-if="command.children"
          class="size-4 text-ink-gray-5"
        />
      </span>
    </template>
  </CommandPaletteItem>
</template>

<script setup lang="ts">
import { useDevice } from "@/composables";
import ShortcutKey from "@helpdesk/shared/ShortcutKey.vue";
import { Avatar } from "frappe-ui";
import { CommandPaletteItem } from "frappe-ui/experimental";
import { computed } from "vue";
import LucideCheck from "~icons/lucide/check";
import LucideChevronRight from "~icons/lucide/chevron-right";
import { titleRuns, type Command } from "./paletteTypes";

const props = defineProps<{
  command: Command;
}>();

/** One unmatched run for every row without server highlighting. */
const runs = computed(() =>
  props.command.marked
    ? titleRuns(props.command.marked)
    : [{ text: props.command.title, match: false }]
);

const { metaIcon } = useDevice();

/** "Mod+Shift+." -> "⌘ Shift ." — ShortcutKey caps each space-separated key. */
const shortcutKeys = computed(() =>
  (props.command.hint ?? "")
    .split("+")
    .map((key) => (key.toLowerCase() === "mod" ? metaIcon : key))
    .join(" ")
);

const hasSuffix = computed(() => {
  const { subtitle, checked, hint, children } = props.command;
  return Boolean(subtitle || checked || hint || children);
});
</script>
