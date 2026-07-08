<template>
  <div class="flex items-center gap-2 border-b py-2.5">
    <span class="text-p-xs text-ink-gray-4">{{ __("From") }}:</span>
    <FormControl
      v-model="fromEmail"
      type="select"
      variant="ghost"
      class="w-full"
      :options="options"
    />
  </div>
</template>

<script setup lang="ts">
import { FormControl } from "frappe-ui";

defineProps<{ options: { label: string; value: string }[] }>();
const fromEmail = defineModel<string>({ default: "" });
</script>
