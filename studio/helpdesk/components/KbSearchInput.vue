<template>
  <!-- Figma: Frappe Helpdesk / input-text (16098:155925). frappe-ui's TextInput can't
       express it — it fixes the height at h-8 and gives a suffix only 36px of absolutely
       positioned room, while this design is 8px-padded with a bordered shortcut chip. -->
  <div class="kb-search" :style="{ padding }" @click="focus">
    <div class="kb-search__field">
      <span class="kb-search__icon">
        <!-- espresso's icon/line/search, exported from the node: a filled path, not
             feather's stroked glyph, and inset inside its own 16px box. -->
        <svg viewBox="0 0 12.33 12.4365" fill="none" aria-hidden="true">
          <path
            d="M5.15332 0C7.99942 0 10.3066 2.30722 10.3066 5.15332C10.3066 6.42343 9.8458 7.58508 9.08398 8.4834L10.6836 10.082L11.54 10.9395L11.9688 11.3682L12.1836 11.582C12.3789 11.7773 12.3789 12.0948 12.1836 12.29C11.9883 12.4853 11.6708 12.4853 11.4756 12.29L11.2617 12.0752L10.833 11.6465L9.97559 10.79L8.36621 9.17969C7.48496 9.88382 6.36904 10.3066 5.15332 10.3066C2.30722 10.3066 0 7.99942 0 5.15332C0 2.30722 2.30722 0 5.15332 0ZM5.15332 1C2.8595 1 1 2.8595 1 5.15332C1 7.44714 2.8595 9.30664 5.15332 9.30664C7.44714 9.30664 9.30664 7.44714 9.30664 5.15332C9.30664 2.8595 7.44714 1 5.15332 1Z"
            fill="currentColor"
          />
        </svg>
      </span>
      <input
        ref="input"
        class="kb-search__input"
        type="text"
        :placeholder="placeholder"
        :value="modelValue"
        @input="$emit('update:modelValue', $event.target.value)"
      />
    </div>
    <div v-if="shortcut" class="kb-search__keys">
      <!-- "keys" splits the accelerator into one chip per key (15886:28429); "label"
           keeps it as a single chip (16098:155925). -->
      <span
        v-if="shortcutVariant === 'keys'"
        class="kb-search__chip kb-search__chip--plain"
      >
        <span v-if="isMac" class="kb-search__glyph">
          <svg viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <path
              d="M10.5 0C11.8807 0 13 1.11929 13 2.5C13 3.88071 11.8807 5 10.5 5H9V8H10.5C11.8807 8 13 9.11929 13 10.5C13 11.8807 11.8807 13 10.5 13C9.11929 13 8 11.8807 8 10.5V9H5V10.5C5 11.8807 3.88071 13 2.5 13C1.11929 13 0 11.8807 0 10.5C0 9.11929 1.11929 8 2.5 8H4V5H2.5C1.11929 5 0 3.88071 0 2.5C0 1.11929 1.11929 0 2.5 0C3.88071 0 5 1.11929 5 2.5V4H8V2.5C8 1.11929 9.11929 0 10.5 0ZM2.5 9C1.67157 9 1 9.67157 1 10.5C1 11.3284 1.67157 12 2.5 12C3.32843 12 4 11.3284 4 10.5V9H2.5ZM9 10.5C9 11.3284 9.67157 12 10.5 12C11.3284 12 12 11.3284 12 10.5C12 9.67157 11.3284 9 10.5 9H9V10.5ZM5 8H8V5H5V8ZM2.5 1C1.67157 1 1 1.67157 1 2.5C1 3.32843 1.67157 4 2.5 4H4V2.5C4 1.67157 3.32843 1 2.5 1ZM10.5 1C9.67157 1 9 1.67157 9 2.5V4H10.5C11.3284 4 12 3.32843 12 2.5C12 1.67157 11.3284 1 10.5 1Z"
              fill="currentColor"
            />
          </svg>
        </span>
        <span v-else>Ctrl</span>
        <span>+K</span>
      </span>
      <span v-else class="kb-search__chip">{{ shortcutLabel }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    placeholder?: string;
    /** Shows the chip and binds the accelerator that focuses this field. */
    shortcut?: boolean;
    /** "keys" renders one chip per key, "label" a single "Cmd+k" chip. */
    shortcutVariant?: "label" | "keys";
    /** Studio doesn't pass block styles to custom components, so this is a prop. */
    padding?: string;
  }>(),
  {
    modelValue: "",
    placeholder: "Search",
    shortcut: true,
    shortcutVariant: "label",
    padding: "2px 2px 2px 10px",
  }
);

defineEmits<{ "update:modelValue": [value: string] }>();

const input = ref<HTMLInputElement | null>(null);
const isMac =
  typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
const shortcutLabel = computed(() => (isMac ? "Cmd+k" : "Ctrl+K"));

function focus() {
  input.value?.focus();
}

function onKeydown(event: KeyboardEvent) {
  if (!props.shortcut) return;
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k")
    return;
  event.preventDefault();
  focus();
  input.value?.select();
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));

defineExpose({ focus });
</script>

<style scoped>
.kb-search {
  display: flex;
  align-items: center;
  gap: 13px;
  width: 100%;
  padding: 2px 2px 2px 10px;
  border-radius: 8px;
  background: var(--surface-gray-2);
  cursor: text;
}

.kb-search__field {
  display: flex;
  flex: 1 0 0;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

/* 16px box with the glyph inset inside it, as the node has it. */
.kb-search__icon {
  position: relative;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  overflow: hidden;
  color: var(--ink-gray-4);
}

.kb-search__icon svg {
  position: absolute;
  inset: 9.53% 13.07% 12.74% 9.86%;
  width: auto;
  height: auto;
  display: block;
}

.kb-search__input {
  flex: 1 0 0;
  min-width: 0;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--ink-gray-8);
  font-size: 14px;
  line-height: 1.15;
  letter-spacing: 0.28px;
}

.kb-search__input:focus {
  outline: none;
  box-shadow: none;
}

.kb-search__input::placeholder {
  color: var(--ink-gray-4);
}

.kb-search__keys {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
}

.kb-search__chip {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 6px 9px;
  border: 1px solid var(--outline-gray-2);
  border-radius: 8px;
  background: var(--surface-gray-2);
  color: var(--ink-gray-4);
  font-size: 14px;
  line-height: 1.15;
  letter-spacing: 0.28px;
  white-space: nowrap;
}

/* one bare "⌘+K" — no fill, no border, just the keys on the bar */
.kb-search__chip--plain {
  gap: 2px;
  border-color: transparent;
  background: transparent;
}

.kb-search__glyph {
  position: relative;
  width: 16px;
  height: 16px;
  overflow: hidden;
}

.kb-search__glyph svg {
  position: absolute;
  inset: 9.38%;
  width: auto;
  height: auto;
  display: block;
}
</style>
