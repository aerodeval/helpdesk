<template>
  <div ref="root" @keydown.capture="onKeydown">
    <MultiEmailInput
      :modelValue="modelValue"
      :placeholder="placeholder"
      size="md"
      @update:modelValue="$emit('update:modelValue', $event)"
    />
  </div>
</template>

<script setup lang="ts">
// frappe-ui ships MultiEmailInput under `experimental/`, which isn't in Studio's
// component palette, so it reaches the block tree through this wrapper. The
// package only exports the barrel — deep paths aren't in its export map.
import { MultiEmailInput } from "frappe-ui/experimental";
import { ref } from "vue";

const props = withDefaults(
  defineProps<{
    /** The addresses entered so far. */
    modelValue?: string[];
    placeholder?: string;
  }>(),
  { modelValue: () => [], placeholder: "Add email…" }
);

const emit = defineEmits<{ "update:modelValue": [value: string[]] }>();

const root = ref<HTMLElement | null>(null);

// MultiEmailInput only splits on paste; Enter commits one address at a time. The
// placeholder promises commas, so commit the typed address on one here too.
function onKeydown(event: KeyboardEvent) {
  if (event.key !== "," && event.key !== ";") return;
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;

  const email = input.value.trim().replace(/[,;]+$/, "");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  event.preventDefault();

  if (
    !props.modelValue.some(
      (entry) => entry.toLowerCase() === email.toLowerCase()
    )
  ) {
    emit("update:modelValue", [...props.modelValue, email]);
  }
  clear(input);
}

// The control drives its query with v-model, so the native setter plus an input
// event is what makes it notice the field is empty again.
function clear(input: HTMLInputElement) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set;
  setter?.call(input, "");
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
</script>
