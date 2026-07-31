<template>
  <!-- List: a contact can belong to several organizations, so this drills in one
       at a time — the same list→detail shape the agent portal uses for Teams. -->
  <template v-if="!selectedOrg">
    <SettingsHeader
      title="Manage organization"
      description="Pick an organization to manage its people and settings."
    />
    <SettingsBody>
      <div class="pt-8">
        <p v-if="!organizations.length" class="text-base text-ink-gray-5">
          You are not a member of any organization yet.
        </p>
        <div v-else class="divide-y divide-outline-gray-1">
          <button
            v-for="organization in organizations"
            :key="organization.name"
            class="flex h-12.5 w-full cursor-pointer items-center gap-3 rounded px-2 text-left hover:bg-surface-sidebar"
            @click="openOrganization(organization.name)"
          >
            <Avatar
              :image="organization.image"
              :label="organization.customer_name"
              shape="square"
              size="lg"
            />
            <div class="min-w-0 flex-1">
              <div class="truncate text-base text-ink-gray-8">
                {{ organization.customer_name }}
              </div>
              <div class="truncate text-sm text-ink-gray-5">
                {{ organization.domain }}
              </div>
            </div>
            <Badge
              variant="subtle"
              :theme="organization.is_manager ? 'blue' : 'gray'"
              :label="organization.is_manager ? 'Manager' : 'Member'"
            />
            <FeatherIcon
              name="chevron-right"
              class="h-4 w-4 shrink-0 text-ink-gray-5"
            />
          </button>
        </div>
      </div>
    </SettingsBody>
  </template>

  <!-- Detail -->
  <template v-else>
    <SettingsHeader>
      <div class="flex items-start justify-between gap-4">
        <Button
          class="-ms-2 !justify-start hover:bg-transparent hover:opacity-70 focus:bg-transparent active:bg-transparent"
          variant="ghost"
          @click="closeOrganization"
        >
          <template #prefix>
            <FeatherIcon name="chevron-left" class="h-4 w-4" />
          </template>
          <span class="text-md font-semibold text-ink-gray-8">
            {{ settingsOrg?.customer_name || selectedOrg }}
          </span>
        </Button>
        <Button
          v-if="isOrgManager"
          variant="solid"
          label="Invite people"
          @click="inviteOpen = true"
        >
          <template #prefix
            ><FeatherIcon name="plus" class="h-4 w-4"
          /></template>
        </Button>
      </div>
    </SettingsHeader>

    <SettingsBody>
      <div class="pt-8">
        <KbSettingsIdentity
          :name="settingsOrg?.customer_name"
          :subtitle="settingsOrg?.domain"
          :image="settingsOrg?.image"
          :busy="settingsBusy"
          :maxLength="ORG_NAME_MAX_LENGTH"
          :editable="isOrgManager"
          shape="square"
          @upload="uploadOrgImage"
          @remove="removeOrgImage"
          @rename="renameOrganization"
        />

        <!-- Everyone in the organization sees its people; the role menu and the
             sections below are a manager's to use. -->
        <section v-if="orgMembers.length">
          <span class="text-base font-semibold text-ink-gray-9">Members</span>
          <div
            class="mt-2 flex items-center justify-between border-b border-outline-gray-1 pb-2 text-sm text-ink-gray-5"
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
                  <span class="truncate text-base text-ink-gray-8">
                    {{ member.full_name }}
                  </span>
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
              <span
                v-if="member.is_owner || !isOrgManager"
                class="text-sm text-ink-gray-6"
                >{{ roleLabel(member) }}</span
              >
              <Dropdown
                v-else
                :options="memberOptions(member)"
                placement="right"
              >
                <button class="flex items-center gap-1 text-sm text-ink-gray-7">
                  {{ member.is_manager ? "Manager" : "Member" }}
                  <FeatherIcon name="chevron-down" class="h-4 w-4" />
                </button>
              </Dropdown>
            </li>
          </ul>
        </section>

        <template v-if="isOrgManager">
          <section class="mt-10">
            <span class="text-base font-semibold text-ink-gray-9"
              >Organization admin</span
            >
            <div class="mt-4 flex max-w-md flex-col gap-6">
              <div>
                <!-- The button sits on the input's row, so this field's helper text
                     is rendered below instead of through FormControl's own slot. -->
                <div class="flex items-end gap-2">
                  <FormControl
                    class="flex-1"
                    label="Admin email"
                    type="email"
                    v-model="orgEmail"
                    :disabled="!orgEmailEditing"
                  />
                  <Button
                    v-if="!orgEmailEditing"
                    variant="subtle"
                    label="Change"
                    @click="orgEmailEditing = true"
                  />
                  <Button
                    v-else
                    variant="solid"
                    label="Save"
                    :loading="settingsBusy"
                    @click="saveOrgEmail"
                  />
                </div>
                <p class="mt-1.5 text-p-sm text-ink-gray-5">
                  Where account and billing notices are sent.
                </p>
              </div>

              <FormControl
                label="Domain"
                description="Verified domain for your organization. It cannot be changed here."
                :modelValue="settingsOrg?.domain"
                disabled
              />
            </div>
          </section>

          <section class="mt-10">
            <span class="text-base font-semibold text-ink-gray-9"
              >Danger zone</span
            >
            <div class="mt-2">
              <SettingsRow
                title="Delete organization"
                description="Permanently remove this organization and all associated data."
              >
                <Button
                  theme="red"
                  variant="subtle"
                  label="Delete"
                  :loading="settingsBusy"
                  @click="deleteOrganization"
                />
              </SettingsRow>
            </div>
          </section>
        </template>
      </div>
    </SettingsBody>
  </template>
</template>

<script setup lang="ts">
// Organizations panel: the list of organizations the signed-in contact belongs to,
// and the drill-in for one of them. Every action names the organization it acts on
// (the store passes `selectedOrg`), and the API re-checks that the caller manages
// that specific organization — a manager of one must not be able to act on another.
import {
  Avatar,
  Badge,
  Button,
  Dropdown,
  FeatherIcon,
  FormControl,
} from "frappe-ui";
import { SettingsBody, SettingsHeader, SettingsRow } from "frappe-ui";
import KbSettingsIdentity from "@app/components/KbSettingsIdentity.vue";
import { useSettingsModal } from "@app/stores/settings";
import { computed } from "vue";

const ORG_NAME_MAX_LENGTH = 34;

const {
  organizations,
  selectedOrg,
  settingsOrg,
  settingsBusy,
  isOrgManager,
  orgMembers,
  orgName,
  orgEmail,
  orgEmailEditing,
  inviteOpen,
  openOrganization,
  closeOrganization,
  saveOrganization,
  saveOrgEmail,
  uploadOrgImage,
  removeOrgImage,
  setMemberRole,
  removeMember,
  cancelInvitation,
  deleteOrganization,
} = useSettingsModal();

function renameOrganization(value: string) {
  orgName.value = value;
  saveOrganization();
}

// Role and removal share one menu: a pending invite can only be cancelled, so it
// gets that single entry rather than roles it cannot hold yet.
function roleLabel(member: any) {
  if (member.is_owner) return "Owner";
  return member.is_manager ? "Manager" : "Member";
}

function memberOptions(member: any) {
  if (member.pending) {
    return [
      {
        label: "Cancel invitation",
        icon: "x-circle",
        onClick: () => cancelInvitation(member),
      },
    ];
  }
  return [
    {
      label: "Member",
      icon: "user",
      onClick: () => setMemberRole(member, "Member"),
    },
    {
      label: "Manager",
      icon: "shield",
      onClick: () => setMemberRole(member, "Manager"),
    },
    {
      label: "Remove from organization",
      icon: "user-minus",
      onClick: () => removeMember(member),
    },
  ];
}
</script>
