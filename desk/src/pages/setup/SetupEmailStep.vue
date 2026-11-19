<template>
  <section class="space-y-6">
    <div class="space-y-1">
      <h1 class="text-2xl-semibold text-ink-gray-9">
        {{ __("Connect your support email") }}
      </h1>
      <p class="text-p-base text-ink-gray-6">
        {{ __("Emails sent to this mailbox become tickets in Helpdesk.") }}
      </p>
    </div>

    <Transition
      mode="out-in"
      enter-active-class="transition duration-500 ease-out motion-reduce:transition-none"
      enter-from-class="opacity-0 translate-y-2"
      leave-active-class="transition duration-150 motion-reduce:transition-none"
      leave-to-class="opacity-0"
    >
      <div v-if="loading" key="loading" class="space-y-2">
        <Skeleton class="h-14 w-full" />
        <Skeleton class="h-14 w-full" />
      </div>

      <EmailAccounts
        v-else-if="!connected"
        key="providers"
        doctype="HD Ticket"
        guided
        @created="onCreated"
      />

      <div v-else key="connected" class="space-y-4">
        <div
          class="flex items-center gap-3 rounded-5 border border-outline-gray-1 bg-surface-elevation-1 p-3"
        >
          <div
            class="flex size-9 shrink-0 items-center justify-center rounded-4 bg-surface-gray-2 text-ink-gray-7"
          >
            <LucideMail class="size-4" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-base text-ink-gray-8" :title="address">
              {{ address }}
            </p>
            <p class="text-sm text-ink-gray-5">{{ __("Incoming mail") }}</p>
          </div>
          <Badge :label="__('Connected')" theme="green" variant="subtle" />
        </div>

        <div
          class="rounded-5 border border-outline-gray-1 p-4"
          aria-live="polite"
        >
          <div v-if="!firstTicket" class="flex items-start gap-3">
            <Spinner v-if="!timedOut" class="mt-0.5 size-4 text-ink-gray-5" />
            <LucideMailQuestion
              v-else
              class="mt-0.5 size-4 shrink-0 text-ink-gray-5"
            />
            <div class="min-w-0 flex-1 space-y-0.5">
              <p class="text-base text-ink-gray-8">
                {{ __("Waiting for your first ticket") }}
              </p>
              <p class="text-p-sm text-ink-gray-5">
                {{
                  __(
                    "Send a test email to {0}. You can continue without waiting.",
                    [address]
                  )
                }}
              </p>
            </div>
            <Button
              v-if="timedOut"
              variant="outline"
              size="sm"
              :label="__('Check again')"
              @click="checkAgain"
            />
          </div>
          <div v-else class="flex items-start gap-3">
            <LucideCircleCheck
              class="mt-0.5 size-4 shrink-0 text-ink-green-5"
            />
            <div class="min-w-0 space-y-0.5">
              <p class="text-base text-ink-gray-8">
                {{ __("Your first ticket has arrived") }}
              </p>
              <p class="truncate text-p-sm text-ink-gray-5" :title="ticketLine">
                {{ ticketLine }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <div class="flex items-center justify-end gap-2 pt-2">
      <Button
        v-if="connected"
        variant="solid"
        :label="__('Continue')"
        @click="emit('next')"
      />
      <Button
        v-else
        variant="outline"
        :label="__('Set up later')"
        @click="confirmSetUpLater"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { createDialog } from "@/components/dialogs";
import { capture } from "@/telemetry";
import { __ } from "@/translation";
import { EmailAccounts } from "@framework/ui/EmailAccounts";
import { useDocumentVisibility } from "@vueuse/core";
import { Badge, Button, Skeleton, Spinner, call } from "frappe-ui";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import LucideCircleCheck from "~icons/lucide/circle-check";
import LucideMail from "~icons/lucide/mail";
import LucideMailQuestion from "~icons/lucide/mail-question";
import { pollDelay } from "./polling";

const props = defineProps<{ status: any }>();
const emit = defineEmits<{ next: []; later: [] }>();

// A failed first load falls through to the picker, so the step stays usable.
const loading = computed(
  () => !props.status.data && !props.status.error && props.status.loading
);
const connected = computed(() => !!props.status.data?.email_connected);
const address = computed(() => props.status.data?.email_address);
const firstTicket = computed(() => props.status.data?.first_ticket);
const ticketLine = computed(
  () =>
    firstTicket.value &&
    `#${firstTicket.value.name} ${firstTicket.value.subject}`
);

// Polling covers the return from provider sign-in, where @created never fires.
// It backs off and stops after a while; "Check again" starts it over.
const visibility = useDocumentVisibility();
const visible = computed(() => visibility.value !== "hidden");
const attempt = ref(0);
const timedOut = computed(() => pollDelay(attempt.value) === null);
let timer: ReturnType<typeof setTimeout> | undefined;

function schedule() {
  clearTimeout(timer);
  const delay = pollDelay(attempt.value);
  if (firstTicket.value || !visible.value || delay === null) return;
  timer = setTimeout(async () => {
    attempt.value++;
    try {
      await props.status.reload();
    } finally {
      schedule();
    }
  }, delay);
}

function checkAgain() {
  attempt.value = 0;
  props.status.reload();
  schedule();
}

watch([firstTicket, visible], schedule, { immediate: true });
onBeforeUnmount(() => clearTimeout(timer));

let ticked = false;
watch(
  connected,
  (isConnected) => {
    if (!isConnected || ticked) return;
    ticked = true;
    call("helpdesk.api.onboarding.mark_checklist_steps", {
      steps: ["setup_email_account"],
    }).catch(() => {
      // best effort: the sidebar checklist can still be ticked by hand
    });
  },
  { immediate: true }
);

function onCreated(service: string) {
  capture("email_account_created", { data: { service: service || "Custom" } });
  checkAgain();
}

function confirmSetUpLater() {
  createDialog({
    title: __("Set up email later?"),
    message: __(
      "Without a connected mailbox, no tickets will be created from email. You can connect one from Settings."
    ),
    actions: [
      { label: __("Stay here") },
      {
        label: __("Set up later"),
        variant: "solid",
        onClick: ({ close }: { close: () => void }) => {
          close();
          emit("later");
        },
      },
    ],
  });
}
</script>
