<template>
  <!-- The agent portal's Profile identity block (desk/.../Settings/Profile/Profile.vue):
       the avatar itself opens the native file picker — no intermediate dialog — and a
       hover-revealed × clears it. The name is edited inline rather than in a form. -->
  <div class="flex items-center gap-4 pt-1.5 pb-8">
    <div class="group relative size-16 shrink-0">
      <Avatar class="!size-16" :image="image" :label="name" :shape="shape" />
      <div
        v-if="editable"
        class="absolute inset-0 cursor-pointer"
        :class="shape === 'square' ? 'rounded-md' : 'rounded-full'"
        @click="$emit('upload')"
      />
      <div
        v-if="image && editable"
        class="absolute -right-1 -top-1 flex size-4 cursor-pointer items-center justify-center rounded-full bg-surface-base opacity-0 outline outline-black-overlay-50 duration-300 ease-in-out group-hover:opacity-100 hover:bg-surface-gray-2"
        @click.stop="$emit('remove')"
      >
        <FeatherIcon name="x" class="size-3.5 text-ink-gray-4" />
      </div>
    </div>

    <div class="flex min-w-0 flex-col gap-1">
      <div v-if="!editing" class="flex items-end gap-1">
        <span class="text-md font-semibold text-ink-gray-8">{{ name }}</span>
        <Button
          v-if="editable"
          class="!h-5 !px-1"
          variant="ghost"
          @click="startEditing"
        >
          <FeatherIcon name="edit-2" class="size-3.5" />
        </Button>
      </div>
      <div v-else class="flex items-center gap-1">
        <TextInput
          ref="nameInput"
          v-model="draft"
          :maxlength="maxLength"
          @keydown.enter="commit"
          @keydown.esc.stop="editing = false"
        />
        <Button
          variant="outline"
          icon="lucide-check"
          :loading="busy"
          @click="commit"
        />
      </div>
      <span class="text-p-sm text-ink-gray-6">{{ subtitle }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Avatar, Button, FeatherIcon, TextInput } from "frappe-ui";
import { nextTick, ref } from "vue";

const props = withDefaults(
  defineProps<{
    name?: string;
    subtitle?: string;
    image?: string;
    shape?: "circle" | "square";
    maxLength?: number;
    busy?: boolean;
    /** A read-only viewer sees the block without upload/remove/rename affordances. */
    editable?: boolean;
  }>(),
  { shape: "circle", editable: true }
);

const emit = defineEmits<{
  (e: "upload"): void;
  (e: "remove"): void;
  (e: "rename", value: string): void;
}>();

const editing = ref(false);
const draft = ref("");
const nameInput = ref<{ el?: HTMLInputElement } | null>(null);

function startEditing() {
  draft.value = props.name || "";
  editing.value = true;
  nextTick(() => nameInput.value?.el?.focus());
}

function commit() {
  const value = draft.value.trim();
  editing.value = false;
  if (value && value !== props.name) emit("rename", value);
}
</script>
