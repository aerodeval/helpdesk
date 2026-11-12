<template>
  <div class="flex items-start justify-between gap-4">
    <div class="flex min-w-0 flex-col">
      <h3 class="text-base-medium text-ink-gray-8">{{ title }}</h3>
      <span v-if="description" class="mt-1 text-base leading-5 text-ink-gray-6">
        {{ description }}
      </span>
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{ title: string; description?: string }>();
</script>
