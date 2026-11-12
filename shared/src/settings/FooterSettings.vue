<!-- Several roots: each is a row of the form's divided list. -->
<template>
  <!-- label-for="": a title click must not flip the switch, so aria-label names it -->
  <SettingsRow
    label-for=""
    :title="__('Show footer')"
    :description="
      __('A footer will appear at the bottom of every knowledge base page.')
    "
  >
    <Switch v-model="footer.enabled" :aria-label="__('Show footer')" />
  </SettingsRow>
  <!-- Off keeps the values, so turning it back on restores them. -->
  <template v-if="footer.enabled">
    <SettingsRow
      :title="__('Tagline')"
      :description="__('Short line under your logo.')"
    >
      <Textarea v-model="footer.tagline" :rows="3" class="w-72" />
    </SettingsRow>
    <SettingsRow
      :title="__('Copyright')"
      :description="__('Shown at the bottom of the footer.')"
    >
      <TextInput
        v-model="footer.copyright"
        class="w-72"
        :placeholder="__('© 2026 Your company')"
      />
    </SettingsRow>
    <FooterColumns v-model="footer.columns" />
    <div class="flex flex-col gap-3">
      <SettingsHeading
        :title="__('Social links')"
        :description="
          __(
            'Icons appear under your tagline. Leave a URL empty to hide its icon.'
          )
        "
      />
      <div class="rounded-5 border border-outline-gray-2 px-1">
        <div
          v-for="network in footerNetworks()"
          :key="network.value"
          class="border-b border-outline-gray-1 py-1 last:border-b-0"
        >
          <div class="flex h-11 items-center gap-2.5 pl-2 sm:h-10">
            <ServiceIcon
              :name="network.value"
              class="size-4 shrink-0 text-ink-gray-6"
            />
            <span class="w-24 shrink-0 text-base text-ink-gray-8">
              {{ network.label }}
            </span>
            <TextInput
              v-model="footer.socials[network.value]"
              class="min-w-0 flex-1"
              variant="ghost"
              :aria-label="__('{0} URL', [network.label])"
              :placeholder="`https://${network.value}.com/your-page`"
            />
          </div>
        </div>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import { SettingsRow, Switch, Textarea, TextInput } from "frappe-ui";
import {
  footerNetworks,
  type KnowledgeBaseFooter,
} from "../knowledgeBaseFooter";
import ServiceIcon from "../ServiceIcon.vue";
import { __ } from "../translation";
import FooterColumns from "./FooterColumns.vue";
import SettingsHeading from "./SettingsHeading.vue";

const footer = defineModel<KnowledgeBaseFooter>({ required: true });
</script>
