<template>
  <TabButtons v-model="active" type="underline" :options="options" />
</template>

<script setup lang="ts">
// frappe-ui's TabButtons in its underline type.
//
// A wrapper because Studio passes a component only the props its own registry declares,
// and `type` is not among them — bound in the block it was dropped and the tabs came out
// as the default pills. Stated here, it reaches the component.
import { computed } from "vue";
import { TabButtons } from "frappe-ui";

const props = defineProps<{
  modelValue?: string;
  options?: { label: string; value: string }[];
}>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const active = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});
</script>
