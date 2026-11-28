<template>
  <span class="inline-flex items-center gap-1">
    <kbd
      v-for="(key, index) in keyList"
      :key="index"
      class="flex items-center justify-center bg-surface-gray-2 text-ink-gray-7"
      :class="
        size === 'sm'
          ? 'h-4 min-w-4 rounded-[4px] px-1 text-[10px] font-medium'
          : 'h-6 min-w-6 rounded-4 px-1.5 text-xs-medium'
      "
    >
      {{ key }}
    </kbd>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";

/** Space-separated keys render as separate caps: "L A" -> [L][A]. */
const props = defineProps<{ keys: string; size?: "sm" }>();

const keyList = computed(() => props.keys.trim().split(/\s+/));
</script>
