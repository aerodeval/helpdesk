<template>
  <SettingsDialog v-model="open" v-model:tab="tab">
    <template #title>Settings</template>

    <SettingsSidebar>
      <SettingsNavGroup label="Personal">
        <SettingsNavItem value="profile">
          <template #prefix>
            <Avatar
              :image="settingsUser.image"
              :label="settingsUser.full_name"
              size="xs"
            />
          </template>
          Profile
        </SettingsNavItem>
      </SettingsNavGroup>
      <SettingsNavGroup v-if="organizations.length" label="Organization">
        <SettingsNavItem value="members">
          <template #prefix
            ><FeatherIcon name="users" class="h-4 w-4"
          /></template>
          Manage organization
        </SettingsNavItem>
        <SettingsNavItem value="organization">
          <template #prefix
            ><FeatherIcon name="briefcase" class="h-4 w-4"
          /></template>
          Organization settings
        </SettingsNavItem>
      </SettingsNavGroup>
    </SettingsSidebar>

    <SettingsContent>
      <!-- Profile -->
      <SettingsPanel value="profile">
        <SettingsHeader
          title="Profile"
          description="How you appear across the knowledge base."
        />
        <!-- SettingsHeader carries no bottom padding, so the body opens with the
             same 32px gap the agent portal's SettingsLayoutBase gives it. -->
        <SettingsBody>
          <div class="pt-8">
            <KbSettingsIdentity
              :name="settingsUser.full_name"
              :subtitle="settingsUser.email"
              :image="settingsUser.image"
              :busy="settingsBusy"
              @upload="uploadProfileImage"
              @remove="removeProfileImage"
              @rename="renameProfile"
            />
            <KbSettingsPreferences
              v-if="settingsUser.email"
              :userId="settingsUser.email"
            />
          </div>
        </SettingsBody>
      </SettingsPanel>

      <!-- Both panels list the organizations first, then drill into one: members
           on this tab, the organization's own settings on the next. -->
      <SettingsPanel value="members">
        <KbSettingsOrganizations mode="members" />
      </SettingsPanel>

      <SettingsPanel value="organization">
        <KbSettingsOrganizations mode="settings" />
      </SettingsPanel>
    </SettingsContent>
  </SettingsDialog>

  <Dialog
    :modelValue="Boolean(confirmAction)"
    @update:modelValue="(value) => !value && cancelConfirm()"
    :options="{ title: confirmAction?.title }"
  >
    <template #body-content>
      <p class="text-p-base text-ink-gray-8">{{ confirmAction?.message }}</p>
    </template>
    <template #actions>
      <div class="flex justify-end gap-2">
        <Button label="Cancel" @click="cancelConfirm" />
        <Button
          theme="red"
          variant="solid"
          :label="confirmAction?.label || 'Confirm'"
          :loading="settingsBusy"
          @click="acceptConfirm"
        />
      </div>
    </template>
  </Dialog>

  <!-- Invite dialog -->
  <Dialog v-model="inviteOpen">
    <template #body-content>
      <h3 class="mb-4 text-lg font-semibold text-ink-gray-9">Invite people</h3>
      <div class="flex flex-col gap-4">
        <FormControl
          label="Email"
          type="email"
          v-model="inviteEmail"
          placeholder="name@company.com"
        />
        <FormControl
          label="Role"
          type="select"
          :options="['Member', 'Manager']"
          v-model="inviteRole"
        />
        <div class="flex justify-end">
          <Button variant="solid" :loading="settingsBusy" @click="sendInvite"
            >Send invite</Button
          >
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
// Settings overlay for the Knowledge Base app. Open state lives in the URL hash
// (`#settings/<tab>`) so it layers over the page underneath — the topbar menu
// opens it via the page script's openSettings(). All data + actions come from
// the shared useSettingsModal store (helpdesk.api.organization); the
// Organizations live in their own panel: a contact can belong to several, so it
// lists them and drills in, and every action there names the organization it acts
// on — the API re-checks management of that specific one.
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Avatar,
  Button,
  Dialog,
  FeatherIcon,
  FormControl,
  SettingsBody,
  SettingsContent,
  SettingsDialog,
  SettingsHeader,
  SettingsNavGroup,
  SettingsNavItem,
  SettingsPanel,
  SettingsSidebar,
} from "frappe-ui";
import KbSettingsIdentity from "@app/components/KbSettingsIdentity.vue";
import KbSettingsOrganizations from "@app/components/KbSettingsOrganizations.vue";
import KbSettingsPreferences from "@app/components/KbSettingsPreferences.vue";
import { useSettingsModal } from "@app/stores/settings";

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

const {
  settingsBusy,
  settingsUser,
  organizations,
  profileFirstName,
  profileLastName,
  inviteOpen,
  inviteEmail,
  inviteRole,
  confirmAction,
  cancelConfirm,
  acceptConfirm,
  openSettings: loadSettingsData,
  saveProfile,
  uploadProfileImage,
  removeProfileImage,
  sendInvite,
} = useSettingsModal();

// The portal stores first and last name separately; the inline field is one box,
// so it splits on the first space and everything after it is the last name.
function renameProfile(value: string) {
  const [first, ...rest] = value.split(/\s+/);
  profileFirstName.value = first;
  profileLastName.value = rest.join(" ");
  saveProfile();
}

// (Re)load the settings payload each time the dialog opens.
watch(
  open,
  (isOpen) => {
    if (isOpen) loadSettingsData(tab.value);
  },
  { immediate: true }
);
</script>
