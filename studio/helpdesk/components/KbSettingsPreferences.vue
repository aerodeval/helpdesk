<template>
  <section>
    <div class="flex h-7 items-center justify-between">
      <span class="text-base font-semibold text-ink-gray-9"
        >Language & Time</span
      >
      <Button
        v-if="isDirty"
        variant="solid"
        label="Save"
        :loading="user.save.loading"
        @click="save"
      />
    </div>
    <div class="mt-2 divide-y divide-outline-gray-1">
      <SettingsRow
        title="Language"
        description="Change language of the application."
      >
        <Autocomplete
          class="w-40"
          placeholder="Select language"
          :options="languageOptions"
          :modelValue="user.doc?.language"
          @update:modelValue="(option) => set('language', option)"
        />
      </SettingsRow>
      <SettingsRow
        title="Timezone"
        description="Change timezone of the application."
      >
        <Autocomplete
          class="w-40"
          placeholder="Select timezone"
          :options="timezoneOptions"
          :modelValue="user.doc?.time_zone"
          @update:modelValue="(option) => set('time_zone', option)"
        />
      </SettingsRow>
    </div>
  </section>
</template>

<script setup lang="ts">
// The Language & Time section of the portal's Profile page, mirroring the agent
// portal's Settings → Preferences (desk/src/components/Settings/Preferences). Both
// fields live on the User doc, which a signed-in user may edit for themselves, so
// this talks to that doc directly rather than through helpdesk.api.organization.
// Theme is deliberately absent — the portal ships light only.
import {
  Autocomplete,
  Button,
  SettingsRow,
  createDocumentResource,
  createResource,
  toast,
} from "frappe-ui";
import { computed, ref } from "vue";

const props = defineProps<{ userId: string }>();

const user = createDocumentResource({ doctype: "User", name: props.userId });

const isDirty = computed(() => {
  if (!user.originalDoc) return false;
  return (
    user.doc?.language !== user.originalDoc?.language ||
    user.doc?.time_zone !== user.originalDoc?.time_zone
  );
});

// Autocomplete hands back the chosen option (or null on clear); an empty pick
// falls back to the saved value so a stray clear cannot blank the field.
function set(
  field: "language" | "time_zone",
  option: { value?: string } | null
) {
  if (!user.doc) return;
  user.doc[field] = option?.value || user.originalDoc?.[field];
}

function save() {
  user.save.submit(null, {
    onSuccess: () => {
      toast.success("Preferences updated successfully.");
      // Language and timezone are read at boot, so the change needs a reload.
      window.location.reload();
    },
    onError: (error: { message: string }) => toast.error(error.message),
  });
}

const languageOptions = ref<{ label: string; value: string }[]>([]);
createResource({
  url: "frappe.client.get_list",
  params: {
    doctype: "Language",
    fields: ["name", "language_name"],
    limit_page_length: 0,
    order_by: "language_name asc",
  },
  auto: true,
  onSuccess(rows: { name: string; language_name: string }[]) {
    languageOptions.value = rows.map((row) => ({
      label: row.language_name || row.name,
      value: row.name,
    }));
  },
});

const timezoneOptions = ref<{ label: string; value: string }[]>([]);
createResource({
  url: "frappe.core.doctype.user.user.get_timezones",
  auto: true,
  onSuccess(data: { timezones: string[] }) {
    timezoneOptions.value = data.timezones.map((zone) => ({
      label: zone,
      value: zone,
    }));
  },
});
</script>
