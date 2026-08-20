<template>
  <Dialog v-model:open="show" :title="`${__('Sharing')} “${title}”`">
    <template #default>
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <span class="text-p-sm text-ink-gray-6">
            {{ __("General access") }}
          </span>
          <!-- The audience is the whole setting: reading is the only right an article
               grants, so there is nothing to pair it with. A Select, not a dropdown: this is one field with three settled values,
               and a menu that opened at its own width beside a full-width button read as
               a different control each time it was used. -->
          <Select
            v-model="access"
            class="w-full"
            size="md"
            :options="accessOptions"
          />
        </div>

        <div class="flex justify-end">
          <Button
            :label="__('Copy link')"
            iconLeft="lucide-link"
            @click="copyLink"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
// Who can read an article, asked as a question about access rather than about publishing.
// Modelled on Frappe Drive's sharing dialog: one "General access" row naming the audience
// and the right they are given.
import { Button, Dialog, Select } from "frappe-ui";
import { computed } from "vue";
import { __ } from "@/translation";
import { copyToClipboard } from "@/utils";

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
  articleId: string;
  title: string;
  visibility: string;
}>();
const emit = defineEmits<{ "update:visibility": [value: string] }>();
const show = defineModel<boolean>({ default: false });

// `icon` on the option is all Select needs: it renders it as the prefix on both the
// trigger and the matching row.
const accessOptions = Object.entries(ACCESS_LEVELS).map(([value, level]) => ({
  value,
  ...level,
}));

const access = computed({
  get: () =>
    props.visibility in ACCESS_LEVELS ? props.visibility : DEFAULT_ACCESS,
  set: (value) => emit("update:visibility", value),
});

function copyLink() {
  const url = new URL(window.location.href);
  url.pathname = `/helpdesk/kb-public/articles/${props.articleId}`;
  copyToClipboard(url.toString(), __("Article link copied to clipboard"));
}
</script>
