<template>
  <SettingsLayoutBase
    :title="__('Profile')"
    :description="__('Manage your profile information.')"
  >
    <template #content>
      <div class="flex items-center justify-between gap-2">
        <FileUploader
          :fileTypes="['image/*']"
          @success="
            (file) => {
              updateImage(file.file_url);
            }
          "
        >
          <template #default="{ openFileSelector, error: _error, uploading }">
            <div class="flex items-center justify-center gap-2">
              <div class="group relative !size-14">
                <Avatar
                  class="!size-14"
                  :image="profile.userImage"
                  :label="profile.fullName"
                />
                <component
                  :is="profile.userImage ? Dropdown : 'div'"
                  v-bind="
                    profile.userImage
                      ? {
                          options: [
                            {
                              icon: 'upload',
                              label: profile.userImage
                                ? __('Change image')
                                : __('Upload image'),
                              onClick: openFileSelector,
                            },
                            {
                              icon: 'trash-2',
                              label: __('Remove image'),
                              onClick: () => updateImage(null),
                            },
                          ],
                        }
                      : { onClick: openFileSelector }
                  "
                >
                  <div
                    class="z-1 absolute top-0 left-0 flex h-9 cursor-pointer items-center justify-center rounded-full bg-black bg-opacity-40 opacity-0 duration-300 ease-in-out group-hover:opacity-100 !size-14"
                  >
                    <CameraIcon class="size-4 cursor-pointer text-white" />
                  </div>
                </component>
                <div
                  v-if="uploading"
                  class="w-full h-full top-0 left-0 absolute bg-black bg-opacity-20 rounded-full flex items-center justify-center"
                >
                  <LoadingIndicator class="size-4" />
                </div>
              </div>
              <div class="flex flex-col gap-1">
                <div class="flex flex-col">
                  <span
                    class="text-lg sm:text-xl !font-semibold text-ink-gray-8"
                    >{{ auth?.userName }}</span
                  >
                  <span class="text-p-sm text-ink-gray-6">{{
                    auth?.user
                  }}</span>
                </div>
                <ErrorMessage :message="__(_error)" />
              </div>
            </div>
          </template>
        </FileUploader>
      </div>
      <hr class="my-6" />
      <div>
        <div class="flex items-center justify-between">
          <div class="flex gap-2 items-center">
            <div class="text-base font-semibold text-ink-gray-9">
              {{ __("Account info & security") }}
            </div>
            <Badge
              v-if="
                isAccountInfoDirty ||
                isLanguageChanged ||
                isSignatureDirty ||
                isSignatureEnabledChanged
              "
              :variant="'subtle'"
              :theme="'orange'"
              size="sm"
              :label="__('Unsaved')"
            />
          </div>
          <Button
            :label="__('Save')"
            @click="onSave"
            :loading="setAgent.loading || saveLanguageResource.loading"
            :disabled="
              !isAccountInfoDirty &&
              !isLanguageChanged &&
              !isSignatureEnabledChanged &&
              !isSignatureDirty
            "
          />
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
          <FormControl
            class="w-full"
            :label="__('First Name')"
            maxlength="40"
            v-model="profile.firstName"
          />
          <FormControl
            class="w-full"
            :label="__('Last Name')"
            maxlength="40"
            v-model="profile.lastName"
          />
        </div>
        <div class="flex items-center justify-between mt-6">
          <div class="flex flex-col gap-1">
            <span class="text-base font-medium text-ink-gray-8">
              {{ __("Password") }}
            </span>
            <span class="text-p-sm text-ink-gray-6">{{
              __("Change your account password for security.")
            }}</span>
          </div>
          <Button
            icon-left="lock"
            :label="__('Change Password')"
            @click="showChangePasswordModal = true"
          />
        </div>
        <div class="flex items-center justify-between mt-6">
          <div class="flex flex-col gap-1">
            <span class="text-base font-medium text-ink-gray-8">
              {{ __("Language") }}
            </span>
            <span class="text-p-sm text-ink-gray-6">{{
              __("Change language of the application.")
            }}</span>
          </div>
          <Link
            :model-value="language"
            @update:modelValue="language = $event || auth.language"
            doctype="Language"
            class="w-40"
          />
        </div>
      </div>
      <div class="flex items-center justify-between mt-6">
        <div class="flex flex-col gap-1">
          <span class="text-base font-medium text-ink-gray-8">
            {{ __("Set Availibility") }}
          </span>
          <span class="text-p-sm text-ink-gray-6">{{
            __("Change language of the application.")
          }}</span>
        </div>
        <div class="space-y-1.5 w-40">
          <Select :options="agentStatusOptions" v-model="agentStatus" />
        </div>
      </div>
      <div class="flex flex-col gap-2 mt-6">
        <div class="flex items-center justify-between">
          <div class="flex flex-col gap-1">
            <span class="text-p-sm font-medium text-ink-gray-8">{{
              __("Set Custom Email Signature")
            }}</span>
            <span class="text-p-sm text-ink-gray-6"
              >{{
                __(
                  "Display a personalized email signature text at the end of an email ."
                )
              }}
            </span>
          </div>
          <Switch v-model="enableSignatureSwitch" />
        </div>
        <div>
          <SignatureEditor
            ref="textEditor"
            editor-class="prose-sm max-w-none min-h-[4rem]"
            @change="(val) => (emailSignatureContent.message = val)"
            :starterkit-options="{ heading: { levels: [2, 3, 4] } }"
            placeholder="Write your email signature here"
            class="mt-1 [&>img]:border-none"
            v-model:content="emailSignatureContent.message"
            v-if="enableSignatureSwitch"
          >
            <template v-slot:editor="{ editor }">
              <EditorContent
                class="max-h-[50vh] overflow-y-auto border rounded-lg p-4"
                :editor="editor"
              />
            </template>

            <template v-slot:bottom>
              <div
                class="mt-2 flex flex-col justify-between sm:flex-row sm:items-center"
              >
                <TextEditorFixedMenu
                  class="-ml-1 overflow-x-auto"
                  :buttons="customButtons"
                />
                <div
                  class="mt-2 flex items-center justify-end space-x-2 sm:mt-0"
                ></div>
              </div>
            </template>
          </SignatureEditor>
        </div>
      </div>
    </template>
  </SettingsLayoutBase>
  <ChangePasswordModal
    v-if="showChangePasswordModal"
    v-model="showChangePasswordModal"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  Avatar,
  Badge,
  Button,
  createResource,
  Dropdown,
  FileUploader,
  LoadingIndicator,
  toast,
  TextEditorFixedMenu,
  Switch,
  Select,
} from "frappe-ui";

import { TextEditor as SignatureEditor } from "frappe-ui";
import { __ } from "@/translation";
import { useAuthStore } from "@/stores/auth";
import CameraIcon from "~icons/lucide/camera";
import ChangePasswordModal from "./components/ChangePasswordModal.vue";
import { disableSettingModalOutsideClick } from "../settingsModal";
import SettingsLayoutBase from "@/components/layouts/SettingsLayoutBase.vue";
import Link from "@/components/frappe-ui/Link.vue";
import { EditorContent } from "@tiptap/vue-3";

const auth = useAuthStore();
const profile = ref({
  fullName: auth.userName,
  userImage: auth.userImage,
  firstName: auth.userFirstName,
  lastName: auth.userLastName,
});
const language = ref(auth.language);
const agentStatus = computed(() => agentData.data?.agent_status);

const isLanguageChanged = computed(() => {
  return language.value !== auth?.language;
});

const isAccountInfoDirty = computed(() => {
  const agentName = agentData.data?.agent_name?.split(" ");
  if (!agentName) return false;
  const isDirty =
    profile.value.firstName !== agentName[0] ||
    profile.value.lastName !== (agentName[1] || "");
  if (isDirty) {
    disableSettingModalOutsideClick.value = true;
  } else {
    disableSettingModalOutsideClick.value = false;
  }
  return isDirty;
});

const customButtons = [
  "Paragraph",
  ["Heading 2", "Heading 3", "Heading 4"],
  "Separator",
  "Bold",
  "Italic",
  "Separator",
  "Bullet List",
  "Numbered List",
  "Separator",
  "Link",
  "Image",
];

const agentStatusOptions = [
  {
    label: __("Available"),
    value: "available",
  },
  {
    label: __("Away"),
    value: "away",
  },
  {
    label: __("AFK"),
    value: "afk",
  },
];
const agentData = createResource({
  url: "helpdesk.helpdesk.doctype.hd_agent.hd_agent.get_agent",
  auto: true,
  onSuccess: (data) => {
    const fullName = data.agent_name.split(" ");
    profile.value = {
      fullName: data.agent_name,
      firstName: fullName[0],
      lastName: fullName[1] || "",
      userImage: data.user_image,
    };
    emailSignatureContent.value.message = data.agent_email_signature || "";
    enableSignatureSwitch.value = data.enable_email_signature;

    // originals
    originalSignatureMessage.value = data.agent_email_signature || "";
    originalEnableSignature.value = data.enable_email_signature;
  },
});

const enableSignatureSwitch = ref(false);
const originalSignatureMessage = ref("");
const originalEnableSignature = ref(false);
const emailSignatureContent = ref({
  message: "",
});
const isSignatureMessageChanged = computed(() => {
  return emailSignatureContent.value.message !== originalSignatureMessage.value;
});

const isSignatureEnabledChanged = computed(() => {
  return enableSignatureSwitch.value !== originalEnableSignature.value;
});

const isSignatureDirty = computed(() => {
  return isSignatureMessageChanged.value || isSignatureEnabledChanged.value;
});

const setAgent = createResource({
  url: "frappe.client.set_value",
  validate: () => {
    if (!profile.value.firstName.trim()) {
      return __("Please enter first name at least");
    }
  },
  makeParams() {
    return {
      doctype: "HD Agent",
      name: agentData.data?.name,
      fieldname: {
        agent_name: `${profile.value.firstName} ${profile.value.lastName}`,
        user_image: profile.value.userImage,
      },
    };
  },
  onSuccess: () => {
    auth.reloadUser();
    agentData.reload();
    toast.success(__("Profile updated"));
  },
});

const saveLanguageResource = createResource({
  url: "frappe.client.set_value",
  makeParams() {
    return {
      doctype: "User",
      name: auth.userId,
      fieldname: {
        language: language.value,
      },
    };
  },
  onSuccess() {
    toast.success(__("Language updated"));
    window.location.reload();
  },
});

const saveSignature = createResource({
  url: "frappe.client.set_value",
  makeParams() {
    return {
      doctype: "HD Agent",
      name: agentData.data?.name,
      fieldname: {
        agent_email_signature: emailSignatureContent.value.message,
        enable_email_signature: enableSignatureSwitch.value,
      },
    };
  },
  onSuccess() {
    originalSignatureMessage.value = emailSignatureContent.value.message;
    originalEnableSignature.value = enableSignatureSwitch.value;

    agentData.reload();
  },
});

const onSave = () => {
  if (isAccountInfoDirty.value) {
    setAgent.submit();
  }

  if (isLanguageChanged.value) {
    saveLanguageResource.submit();
  }
  if (isSignatureDirty.value) {
    saveSignature.submit();
  }
};

const updateImage = (file: string | null) => {
  profile.value.userImage = file;
  setAgent.submit();
};
</script>
