<template>
  <SetupFlow v-if="steps" :steps="steps" :labels="labels" @finish="finish">
    <template #brand>
      <div class="flex items-center gap-2">
        <HDLogo class="size-7" />
        <span class="text-lg-semibold text-ink-gray-9">{{
          __("Helpdesk")
        }}</span>
      </div>
    </template>

    <template #step="{ step, done, skip }">
      <Transition
        mode="out-in"
        enter-active-class="transition duration-500 ease-out motion-reduce:transition-none"
        enter-from-class="opacity-0 translate-y-3"
        leave-active-class="transition duration-200 ease-in motion-reduce:transition-none"
        leave-to-class="opacity-0 -translate-y-1"
      >
        <section
          v-if="step.name === 'password'"
          key="password"
          class="space-y-6"
        >
          <div class="space-y-1">
            <h1 class="text-2xl-semibold text-ink-gray-9">
              {{ __("Set your password") }}
            </h1>
            <p class="text-p-base text-ink-gray-6">
              {{
                __(
                  "You are signed in, but have no password yet. Set one so you can sign in again from any device."
                )
              }}
            </p>
          </div>
          <PasswordStep :labels="passwordLabels" @done="done()" />
        </section>
        <SetupEmailStep
          v-else-if="step.name === 'email'"
          key="email"
          :status="status"
          @next="done()"
          @later="skip()"
        />
        <SetupInviteStep
          v-else
          key="invite"
          v-model:rows="rows"
          :finishing="finishing"
          @done="done"
          @skip="skip()"
        />
      </Transition>
    </template>

    <template #footer>
      <div class="mx-auto w-full max-w-md">
        <TelemetryConsent
          app-name="helpdesk"
          :label="__('Share usage data')"
          :error-message="__('Could not save your choice. Please try again.')"
        />
        <p class="mt-1 ps-6 text-p-xs text-ink-gray-5">
          {{ __("Helps us improve Helpdesk. Saved as soon as you change it.") }}
        </p>
      </div>
    </template>

    <template #preview>
      <SetupPreview
        :mailbox="status.data?.email_address || null"
        :arrived="!!status.data?.first_ticket"
        :invitees="invitees"
      />
    </template>
  </SetupFlow>
  <div v-else class="flex min-h-screen items-center justify-center">
    <Spinner class="size-5 text-ink-gray-5" />
  </div>

  <SetupDoneDialog
    :open="showDone"
    :connected="!!status.data?.email_connected"
    :agents="
      invitees.filter((invitee) => invitee.sent).map((invitee) => invitee.email)
    "
    :ask-feedback="telemetry.isEnabled.value"
    @close="closeDone"
  />
</template>

<script setup lang="ts">
import HDLogo from "@/assets/logos/HDLogo.vue";
import { createDialog } from "@/components/dialogs";
import { useAuthStore } from "@/stores/auth";
import { capture } from "@/telemetry";
import { __ } from "@/translation";
import { getErrorMessage } from "@/utils";
import {
  PasswordStep,
  SetupFlow,
  TelemetryConsent,
  useTelemetry,
  type SetupStep,
} from "@framework/ui";
import { Spinner, call, createResource, toast } from "frappe-ui";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import SetupDoneDialog from "./SetupDoneDialog.vue";
import SetupEmailStep from "./SetupEmailStep.vue";
import SetupInviteStep from "./SetupInviteStep.vue";
import SetupPreview from "./SetupPreview.vue";
import { createInviteRow, previewInvitees, type InviteRow } from "./invites";

const router = useRouter();
const authStore = useAuthStore();
const telemetry = useTelemetry();

const rows = ref<InviteRow[]>([createInviteRow()]);
const invitees = computed(() => previewInvitees(rows.value));
const finishing = ref(false);
const showDone = ref(false);

// Fixed after the first load: the poll must not drop the password step mid-flow.
const steps = ref<SetupStep[] | null>(null);

const status = createResource({
  url: "helpdesk.api.onboarding.get_setup_status",
  method: "GET",
  auto: true,
  onSuccess(data: { needs_password: boolean }) {
    steps.value ??= [
      ...(data.needs_password ? [{ name: "password", required: true }] : []),
      { name: "email" },
      { name: "invite" },
    ];
  },
  onError() {
    // One toast however often the poll fails; the flow itself stays usable.
    toast.error(__("Couldn't check your email setup"), {
      id: "setup-status-error",
      description: __("You can keep going. We'll try again shortly."),
    });
    steps.value ??= [{ name: "email" }, { name: "invite" }];
  },
});

const labels = computed(() => ({
  back: __("Back"),
  skip: __("Skip setup"),
  skipTitle: __("Skip setup?"),
  skipMessage: __(
    "You can connect email and invite agents later from Settings."
  ),
  cancel: __("Keep going"),
  stepOf: (step: number, total: number) => __("Step {0} of {1}", [step, total]),
}));

const passwordLabels = computed(() => ({
  label: __("Password"),
  placeholder: __("At least 8 characters"),
  hint: "",
  show: __("Show"),
  hide: __("Hide"),
  save: __("Save and continue"),
  failed: __("That password could not be saved. Try another."),
}));

async function finish() {
  finishing.value = true;
  try {
    await call("helpdesk.api.onboarding.complete_setup");
  } catch (error) {
    // SetupFlow has already ended, so retry here or the admin is stuck on the last step
    createDialog({
      title: __("Could not finish setup"),
      message: getErrorMessage(error, false, __("Please try again.")),
      actions: [
        {
          label: __("Try again"),
          variant: "solid",
          onClick: ({ close }: { close: () => void }) => {
            close();
            finish();
          },
        },
      ],
    });
    return;
  } finally {
    finishing.value = false;
  }
  authStore.markSetupDone();
  showDone.value = true;
}

function closeDone(feedback: { rating: number; comment: string } | null) {
  if (feedback) {
    capture("setup_feedback", { data: feedback });
    toast.success(__("Thanks for the feedback"));
  }
  showDone.value = false;
  router.replace({ name: "Home" });
}
</script>
