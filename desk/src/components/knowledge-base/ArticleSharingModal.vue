<template>
  <Dialog v-model:open="show" :title="`${__('Sharing')} “${title}”`">
    <template #default>
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <span class="text-p-sm text-ink-gray-6">
            {{ __("General access") }}
          </span>
          <!-- The audience is the whole setting: reading is the only right an article
               grants, so there is nothing to pair it with. A Select, not a dropdown: this
               is one field with three settled values, and a menu that opened at its own
               width beside a full-width button read as a different control each time it
               was used. -->
          <Select
            v-model="access"
            class="w-full"
            size="md"
            :options="accessOptions"
          />
        </div>

        <div class="flex justify-end">
          <Button variant="solid" :label="__('Publish')" @click="publish" />
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
// Who can read an article, asked as a question about access rather than about publishing.
// Modelled on Frappe Drive's sharing dialog: one "General access" row naming the audience
// and the right they are given.
//
// Picking an audience does not save it — publishing does, and the two travel together in
// one write. An article therefore never goes live before its audience is settled.
import { Button, Dialog, Select } from "frappe-ui";
import { ref, watch } from "vue";
import { __ } from "@/translation";

// The three audiences an article can be written for, in the order they widen.
// Keyed by what `HD Article.visibility` stores.
const ACCESS_LEVELS: Record<string, { label: string; icon: string }> = {
  "Agents only": {
    label: __("Accessible to agents only"),
    icon: "lucide-lock",
  },
  "Customers only": {
    label: __("Accessible to customers only"),
    icon: "lucide-building-2",
  },
  Public: { label: __("Accessible to everyone"), icon: "lucide-globe" },
};
const DEFAULT_ACCESS = "Public";

const props = defineProps<{
  title: string;
  visibility: string;
}>();
const emit = defineEmits<{ publish: [visibility: string] }>();
const show = defineModel<boolean>({ default: false });

// `icon` on the option is all Select needs: it renders it as the prefix on both the
// trigger and the matching row.
const accessOptions = Object.entries(ACCESS_LEVELS).map(([value, level]) => ({
  value,
  ...level,
}));

const access = ref(DEFAULT_ACCESS);

// Seeded every time the dialog opens, so an audience picked and then abandoned by closing
// the dialog does not turn up again on the next visit.
watch(show, (open) => {
  if (!open) return;
  access.value =
    props.visibility in ACCESS_LEVELS ? props.visibility : DEFAULT_ACCESS;
});

function publish() {
  emit("publish", access.value);
  show.value = false;
}
</script>
