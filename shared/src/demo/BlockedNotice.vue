<!-- The screen every Blocked Action raises: why nothing happened, and the way to the real thing.
     Mounted on its own app by `showBlocked`, like the tour card. -->
<template>
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="opacity-0"
    leave-active-class="transition duration-200 ease-in"
    leave-to-class="opacity-0"
  >
    <!-- a blocked save usually comes from an open dialog: stay clickable over its modal layer,
         and keep the click from dismissing that dialog and the visitor's input with it -->
    <div
      v-if="notice.title"
      role="dialog"
      aria-modal="true"
      class="pointer-events-auto fixed inset-0 z-50 flex flex-col bg-surface-base/90 backdrop-blur-md"
      @pointerdown.stop
    >
      <div class="flex justify-end p-4">
        <Button
          variant="ghost"
          size="md"
          :aria-label="__('Close')"
          @click="close"
        >
          <LucideX class="size-4" />
        </Button>
      </div>
      <div
        class="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-8 px-6 pb-24 text-center"
      >
        <div
          class="grid size-14 place-items-center rounded-full border border-outline-gray-2 bg-surface-base shadow-sm"
        >
          <LucideLock class="size-6 text-ink-gray-7" />
        </div>
        <div class="flex flex-col gap-3">
          <p
            class="text-[32px] font-semibold leading-tight tracking-tight text-ink-gray-9"
          >
            {{ notice.title }}
          </p>
          <p class="text-p-lg text-ink-gray-6">
            {{
              __(
                "This demo doesn't save changes. Get your own Helpdesk on Frappe Cloud in a few minutes, or talk to us about your team."
              )
            }}
          </p>
        </div>
        <div class="flex flex-wrap justify-center gap-x-6 gap-y-2">
          <span
            v-for="perk in perks"
            :key="perk.label"
            class="flex items-center gap-2 text-base text-ink-gray-7"
          >
            <component :is="perk.icon" class="size-4 text-ink-gray-5" />
            {{ perk.label }}
          </span>
        </div>
        <div class="flex flex-col items-center gap-3">
          <div class="flex gap-2">
            <Button
              variant="solid"
              size="lg"
              :label="__('Start free trial')"
              :href="TRIAL_URL"
            />
            <Button
              variant="outline"
              size="lg"
              :label="__('Talk to sales')"
              :href="SALES_URL"
            />
          </div>
          <button
            class="text-base text-ink-gray-5 hover:text-ink-gray-8"
            @click="close"
          >
            {{ __("Keep exploring the demo") }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script lang="ts">
import { shallowReactive } from "vue";

const notice = shallowReactive({ title: "" });

export function raiseNotice(title: string) {
  notice.title = title;
}

export const noticeOpen = () => Boolean(notice.title);
</script>

<script setup lang="ts">
import { useEventListener } from "@vueuse/core";
import { Button } from "frappe-ui";
import LucideGitBranch from "~icons/lucide/git-branch";
import LucideInbox from "~icons/lucide/inbox";
import LucideLock from "~icons/lucide/lock";
import LucideUsers from "~icons/lucide/users";
import LucideX from "~icons/lucide/x";
import { __ } from "../translation";
import { SALES_URL, TRIAL_URL } from "./dock";

const perks = [
  { icon: LucideInbox, label: __("Your tickets and email") },
  { icon: LucideUsers, label: __("Your whole team") },
  { icon: LucideGitBranch, label: __("Open source") },
];

function close() {
  notice.title = "";
}

// capture phase: Esc closes this screen only, not the dialog underneath it
useEventListener(
  window,
  "keydown",
  (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !notice.title) return;
    event.stopPropagation();
    close();
  },
  { capture: true }
);
</script>
