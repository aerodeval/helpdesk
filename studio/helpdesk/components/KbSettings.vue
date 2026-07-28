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
      <SettingsNavGroup v-if="isOrgManager" label="Organization">
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
        <SettingsBody>
          <div class="flex max-w-md flex-col gap-6 pt-8">
            <div class="flex items-center gap-4">
              <Avatar
                :image="settingsUser.image"
                :label="settingsUser.full_name"
                size="3xl"
              />
              <div class="flex gap-2">
                <Button variant="subtle" @click="uploadProfileImage"
                  >Upload image</Button
                >
                <Button
                  v-if="settingsUser.image"
                  variant="ghost"
                  @click="removeProfileImage"
                  >Remove</Button
                >
              </div>
            </div>
            <div class="flex gap-4">
              <FormControl
                class="flex-1"
                label="First name"
                v-model="profileFirstName"
              />
              <FormControl
                class="flex-1"
                label="Last name"
                v-model="profileLastName"
              />
            </div>
            <FormControl
              label="Email"
              type="email"
              :modelValue="settingsUser.email"
              disabled
            />
            <div>
              <Button
                variant="solid"
                :loading="settingsBusy"
                @click="saveProfile"
                >Save changes</Button
              >
            </div>
          </div>
        </SettingsBody>
      </SettingsPanel>

      <!-- Manage organization + Organization settings are manager-only -->
      <template v-if="isOrgManager">
        <SettingsPanel value="members">
          <SettingsHeader
            title="Manage organization"
            description="Manage teams and their roles within your organization"
          >
            <template #actions>
              <Button variant="solid" @click="inviteOpen = true">
                <template #prefix
                  ><FeatherIcon name="plus" class="h-4 w-4"
                /></template>
                Invite people
              </Button>
            </template>
          </SettingsHeader>
          <SettingsBody>
            <div
              class="flex items-center justify-between border-b border-outline-gray-1 pb-2 text-sm text-ink-gray-5"
            >
              <span>Name</span><span>Role</span>
            </div>
            <ul class="divide-y divide-outline-gray-1">
              <li
                v-for="member in orgMembers"
                :key="member.contact || member.invitation"
                class="flex items-center gap-3 py-3"
              >
                <Avatar
                  :image="member.image"
                  :label="member.full_name"
                  size="lg"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="truncate text-base text-ink-gray-8">{{
                      member.full_name
                    }}</span>
                    <Badge
                      v-if="member.pending"
                      theme="orange"
                      variant="subtle"
                      label="Pending"
                    />
                  </div>
                  <div class="truncate text-sm text-ink-gray-5">
                    {{ member.email }}
                  </div>
                </div>
                <span v-if="member.is_owner" class="text-sm text-ink-gray-6"
                  >Owner</span
                >
                <Dropdown
                  v-else-if="!member.pending"
                  :options="roleOptions(member)"
                >
                  <button
                    class="flex items-center gap-1 text-sm text-ink-gray-7"
                  >
                    {{ member.is_manager ? "Manager" : "Member" }}
                    <FeatherIcon name="chevron-down" class="h-4 w-4" />
                  </button>
                </Dropdown>
                <span v-else class="text-sm text-ink-gray-6">
                  {{ member.is_manager ? "Manager" : "Member" }}
                </span>
                <Button
                  v-if="!member.is_owner"
                  variant="ghost"
                  @click="removeMember(member)"
                >
                  <FeatherIcon name="trash-2" class="h-4 w-4 text-ink-gray-6" />
                </Button>
              </li>
            </ul>
          </SettingsBody>
        </SettingsPanel>

        <SettingsPanel value="organization">
          <SettingsHeader
            title="Organization settings"
            description="Manage teams and their roles within your organization"
          >
            <template #actions>
              <Button variant="solid" @click="inviteOpen = true">
                <template #prefix
                  ><FeatherIcon name="plus" class="h-4 w-4"
                /></template>
                Invite people
              </Button>
            </template>
          </SettingsHeader>
          <SettingsBody>
            <div class="flex max-w-xl flex-col gap-8">
              <div class="flex items-center gap-4">
                <Avatar
                  :image="settingsOrg?.image"
                  :label="settingsOrg?.customer_name"
                  size="2xl"
                  shape="square"
                />
                <div class="min-w-0 flex-1">
                  <div class="truncate text-base font-medium text-ink-gray-8">
                    {{ settingsOrg?.customer_name }}
                  </div>
                  <div class="truncate text-sm text-ink-gray-5">
                    {{ settingsOrg?.email }}
                  </div>
                </div>
                <Button
                  v-if="settingsOrg?.image"
                  variant="ghost"
                  @click="removeOrgImage"
                  >Remove</Button
                >
                <Button variant="subtle" @click="uploadOrgImage"
                  >Upload image</Button
                >
              </div>

              <div class="flex gap-4">
                <div class="flex-1">
                  <FormControl
                    label="Name"
                    v-model="orgName"
                    maxlength="34"
                    @change="saveOrganization"
                  />
                  <p class="mt-1 text-sm text-ink-gray-5">
                    Organization name can up to 34 characters
                  </p>
                </div>
                <FormControl
                  class="flex-1"
                  label="Domain"
                  :modelValue="settingsOrg?.domain"
                  disabled
                />
              </div>

              <div>
                <h3 class="text-base font-semibold text-ink-gray-8">
                  Organization admin
                </h3>
                <div class="mt-4 flex items-end justify-between gap-4">
                  <div class="min-w-0 flex-1">
                    <div class="text-sm text-ink-gray-5">Admin Email</div>
                    <div
                      v-if="!orgEmailEditing"
                      class="truncate text-base text-ink-gray-8"
                    >
                      {{ settingsOrg?.email }}
                    </div>
                    <FormControl
                      v-else
                      type="email"
                      v-model="orgEmail"
                      class="mt-1"
                    />
                  </div>
                  <Button
                    v-if="!orgEmailEditing"
                    variant="subtle"
                    @click="orgEmailEditing = true"
                  >
                    Change email
                  </Button>
                  <Button
                    v-else
                    variant="solid"
                    :loading="settingsBusy"
                    @click="saveOrgEmail"
                    >Save</Button
                  >
                </div>
              </div>

              <div>
                <h3 class="text-base font-semibold text-ink-gray-8">
                  Danger Zone
                </h3>
                <div class="mt-4 flex items-center justify-between gap-4">
                  <div>
                    <div class="text-base font-medium text-ink-gray-8">
                      Delete account
                    </div>
                    <div class="text-sm text-ink-gray-5">
                      Permanently remove your account and all associated data.
                    </div>
                  </div>
                  <Button
                    theme="red"
                    variant="subtle"
                    :loading="settingsBusy"
                    @click="deleteOrganization"
                  >
                    <template #prefix
                      ><FeatherIcon name="alert-triangle" class="h-4 w-4"
                    /></template>
                    Delete account
                  </Button>
                </div>
              </div>
            </div>
          </SettingsBody>
        </SettingsPanel>
      </template>
    </SettingsContent>
  </SettingsDialog>

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
// Organization tabs are manager-only — isOrgManager gates both the nav items and
// the panels, backed server-side by get_managed_customer().
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Avatar,
  Badge,
  Button,
  Dialog,
  Dropdown,
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
  settingsOrg,
  isOrgManager,
  orgMembers,
  profileFirstName,
  profileLastName,
  orgName,
  orgEmail,
  orgEmailEditing,
  inviteOpen,
  inviteEmail,
  inviteRole,
  openSettings: loadSettingsData,
  saveProfile,
  uploadProfileImage,
  removeProfileImage,
  sendInvite,
  setMemberRole,
  removeMember,
  saveOrganization,
  saveOrgEmail,
  uploadOrgImage,
  removeOrgImage,
  deleteOrganization,
} = useSettingsModal();

function roleOptions(member: any) {
  return [
    { label: "Member", onClick: () => setMemberRole(member, "Member") },
    { label: "Manager", onClick: () => setMemberRole(member, "Manager") },
  ];
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
