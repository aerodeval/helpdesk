<!-- The demo dock on desktop, in the sidebar footer: who the visitor is viewing as.
     It stands in for Getting started and the Collapse row. -->
<template>
  <div v-if="!isCollapsed" class="flex items-center gap-1 border-t pt-2">
    <button
      class="flex min-w-0 flex-1 items-center gap-2 rounded-6 p-1 text-start hover:bg-surface-gray-2"
      :aria-label="switchLabel"
      @click="switchPersona"
    >
      <Avatar
        :image="user.image"
        :label="user.fullname"
        shape="square"
        size="lg"
      />
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="truncate text-base font-medium text-ink-gray-9">
          {{ user.fullname }}
        </span>
        <span class="truncate text-p-sm text-ink-gray-5">
          {{ viewingAs }}
        </span>
      </span>
      <LucideChevronsUpDown class="size-4 shrink-0 text-ink-gray-5" />
    </button>
    <Button
      variant="ghost"
      icon="lucide-panel-left-close"
      :tooltip="__('Collapse')"
      :aria-label="__('Collapse')"
      @click="toggleSidebar"
    />
  </div>

  <div v-else class="flex flex-col items-center gap-2">
    <Dropdown :options="collapsedMenu" side="right">
      <Button variant="ghost" :aria-label="switchLabel">
        <Avatar
          :image="user.image"
          :label="user.fullname"
          shape="square"
          size="sm"
        />
      </Button>
    </Dropdown>
    <Button
      variant="ghost"
      icon="lucide-panel-left-open"
      :tooltip="__('Expand')"
      :aria-label="__('Expand')"
      @click="toggleSidebar"
    />
  </div>
</template>

<script setup lang="ts">
import { __ } from "@/translation";
import {
  demoBoot,
  loginUrl,
  restartDemo,
  sessionUser,
} from "@helpdesk/shared/demo";
import {
  Avatar,
  Button,
  Dropdown,
  sidebarCollapsedKey,
  sidebarToggleKey,
} from "frappe-ui";
import { computed, inject } from "vue";
import LucideArrowLeftRight from "~icons/lucide/arrow-left-right";
import LucideChevronsUpDown from "~icons/lucide/chevrons-up-down";
import LucideRotateCcw from "~icons/lucide/rotate-ccw";

const isCollapsed = inject(
  sidebarCollapsedKey,
  computed(() => false)
);
const toggleSidebar = inject(sidebarToggleKey, () => {});

const { persona, first_names } = demoBoot()!;
const user = sessionUser();
const other = persona === "customer" ? "agent" : "customer";
const switchLabel = __("Switch to {0}", [first_names[other]]);
const viewingAs =
  persona === "customer" ? __("Viewing as customer") : __("Viewing as agent");

function switchPersona() {
  location.assign(loginUrl(other));
}

const collapsedMenu = computed(() => [
  {
    group: "persona",
    hideLabel: true,
    options: [
      {
        label: switchLabel,
        icon: LucideArrowLeftRight,
        onClick: switchPersona,
      },
    ],
  },
  {
    group: "demo",
    hideLabel: true,
    options: [
      {
        label: __("Restart demo"),
        icon: LucideRotateCcw,
        onClick: restartDemo,
      },
    ],
  },
]);
</script>
