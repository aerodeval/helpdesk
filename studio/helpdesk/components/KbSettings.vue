<template>
  <SettingsDialog v-model="open" v-model:tab="tab">
    <template #title>Settings</template>
    <SettingsSidebar>
      <SettingsNavGroup label="Personal">
        <SettingsNavItem value="profile">
          <template #prefix>
            <Avatar :image="user.user_image" :label="userLabel" size="xs" />
          </template>
          Profile
        </SettingsNavItem>
      </SettingsNavGroup>
    </SettingsSidebar>
    <SettingsContent>
      <SettingsPanel value="profile">
        <SettingsHeader
          title="Profile"
          description="How you appear across the knowledge base."
        />
        <SettingsBody>
          <div class="flex max-w-md flex-col gap-6">
            <div class="flex items-center gap-4">
              <Avatar :image="user.user_image" :label="userLabel" size="3xl" />
              <div class="min-w-0">
                <div class="truncate text-base font-medium text-ink-gray-8">
                  {{ userLabel }}
                </div>
                <div class="truncate text-sm text-ink-gray-5">
                  {{ user.email }}
                </div>
              </div>
            </div>
            <FormControl v-model="fullName" label="Full name" />
            <FormControl
              label="Email"
              type="email"
              :modelValue="user.email"
              disabled
            />
            <ErrorMessage :message="error" />
            <div>
              <Button
                variant="solid"
                :loading="saving"
                :disabled="!dirty"
                @click="save"
              >
                Save changes
              </Button>
            </div>
          </div>
        </SettingsBody>
      </SettingsPanel>
    </SettingsContent>
  </SettingsDialog>
</template>

<script setup lang="ts">
// Settings overlay for the Knowledge Base app. Open state lives in the URL hash
// (`#settings/<tab>`) so it layers over the page underneath and closing lands
// back there — the topbar menu opens it via the page script's openSettings().
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Avatar,
  Button,
  ErrorMessage,
  FormControl,
  SettingsBody,
  SettingsContent,
  SettingsDialog,
  SettingsHeader,
  SettingsNavGroup,
  SettingsNavItem,
  SettingsPanel,
  SettingsSidebar,
  call,
} from "frappe-ui";

const HASH_ROOT = "settings";
const route = useRoute();
const router = useRouter();

const segments = computed(() => {
  const parts = route.hash.replace(/^#/, "").split("/");
  return parts[0] === HASH_ROOT ? parts.slice(1) : null;
});

const open = computed({
  get: () => segments.value !== null,
  set: (value) => {
    if (!value) router.push({ query: route.query, hash: "" });
  },
});

const tab = computed({
  get: () => segments.value?.[0] || "profile",
  set: (value) =>
    router.push({ query: route.query, hash: `#${HASH_ROOT}/${value}` }),
});

function sessionEmail() {
  const cookies = new URLSearchParams(document.cookie.split("; ").join("&"));
  const email = cookies.get("user_id");
  return email && email !== "Guest" ? decodeURIComponent(email) : "";
}

const user = ref<{ email: string; full_name?: string; user_image?: string }>({
  email: sessionEmail(),
});
const userLabel = computed(() => user.value.full_name || user.value.email);

const fullName = ref("");
const saving = ref(false);
const error = ref("");

const dirty = computed(
  () =>
    fullName.value.trim() !== (user.value.full_name || "") &&
    Boolean(fullName.value.trim())
);

async function loadUser() {
  if (!user.value.email) return;
  const info = await call("frappe.client.get_value", {
    doctype: "User",
    filters: { name: user.value.email },
    fieldname: ["full_name", "user_image"],
  });
  if (info) user.value = { ...user.value, ...info };
  fullName.value = user.value.full_name || "";
}

async function save() {
  saving.value = true;
  error.value = "";
  try {
    await call("frappe.client.set_value", {
      doctype: "User",
      name: user.value.email,
      fieldname: "full_name",
      value: fullName.value.trim(),
    });
    user.value = { ...user.value, full_name: fullName.value.trim() };
  } catch (exception: any) {
    error.value = exception?.messages?.[0] || "Could not save your profile.";
  } finally {
    saving.value = false;
  }
}

// Load the user the first time the dialog opens.
watch(
  open,
  (isOpen) => {
    if (isOpen && !user.value.full_name) loadUser();
  },
  { immediate: true }
);
</script>
