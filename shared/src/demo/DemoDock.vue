<template>
  <!-- `contents`, so the pill and the CTA sit in the corners of whatever box mounts the dock -->
  <div id="demo-dock" class="contents">
    <Dropdown :options="options" side="top" portal-to="#demo-dock">
      <Button
        size="md"
        variant="outline"
        class="absolute bottom-[calc(4rem+env(safe-area-inset-bottom))] left-4 z-20 rounded-full shadow-lg max-sm:h-11 sm:h-10"
      >
        <template #prefix>
          <Avatar
            v-if="persona"
            :image="user.image"
            :label="user.fullname"
            size="sm"
          />
        </template>
        {{ label }}
        <template #suffix>
          <LucideChevronUp class="size-4 text-ink-gray-5" />
        </template>
      </Button>
    </Dropdown>
    <div
      class="absolute bottom-[calc(4rem+env(safe-area-inset-bottom))] right-4 z-20 flex gap-1 rounded-6 bg-surface-base p-1 shadow-lg"
    >
      <Button
        variant="ghost"
        size="md"
        class="max-sm:hidden"
        :label="__('Talk to sales')"
        :href="SALES_URL"
      />
      <Button
        variant="solid"
        size="md"
        class="max-sm:h-11"
        :label="__('Start free trial')"
        :href="TRIAL_URL"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Avatar, Button, Dropdown } from "frappe-ui";
import { computed } from "vue";
import LucideArrowLeftRight from "~icons/lucide/arrow-left-right";
import LucideChevronUp from "~icons/lucide/chevron-up";
import LucideRotateCcw from "~icons/lucide/rotate-ccw";
import { __ } from "../translation";
import { loginUrl, SALES_URL, TRIAL_URL } from "./dock";
import { restartDemo } from "./overlay";
import { demoBoot, sessionUser, type Persona } from "./session";

const PERSONAS: Persona[] = ["agent", "customer"];

const { persona, first_names } = demoBoot()!;
const user = sessionUser();
const label = persona ? __("Demo · {0}", [first_names[persona]]) : __("Demo");

const options = computed(() => [
  {
    group: "persona",
    hideLabel: true,
    options: PERSONAS.filter((other) => other !== persona).map((other) => ({
      label: __("Switch to {0}", [first_names[other]]),
      icon: LucideArrowLeftRight,
      onClick: () => location.assign(loginUrl(other)),
    })),
  },
  {
    group: "restart",
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

<style>
/* Blocked-action toasts stack above the CTA: 4rem dock offset + 40px bar + 8px gap (52px bar on phone) */
[data-sonner-toaster] {
  --offset-bottom: 112px !important;
  --offset-right: 16px !important;
  --mobile-offset-bottom: 124px !important;
}

@media (max-width: 639px) {
  #demo-dock [data-slot="item-list-row"] {
    min-height: 44px;
  }
}
</style>
