<template>
  <!--
    Helpdesk's reply box, built on the shared @framework/ui composer parts.
    One Composer window holds two channels behind a switcher — Email (sent via
    reply_via_agent) and Comment (new_comment) — and wires the composer slots
    onto helpdesk: contact search for recipients, the agent's outgoing addresses
    for the From picker (attachments are built into the composer itself).

    Gated on agents being loaded: frappe-ui's TextEditor wires the @-mention
    extension once at editor-init and only when `mentions` is non-empty, so the
    editor must not mount before `dropdown` is populated.
  -->
  <template v-if="agentsList.data">
    <Composer v-model:open="isOpen" v-model:channel="channel">
      <ComposerTrigger
        :placeholder="placeholder || 'Type a message'"
        v-slot="{ preview }"
      >
        <Avatar
          :image="userResource.data?.user_image || ''"
          :label="userResource.data?.full_name || ''"
          size="sm"
          class="shrink-0"
        />
        <span class="min-w-0 max-w-[30%] truncate text-base text-ink-gray-5">{{
          preview || placeholder || "Type a message"
        }}</span>
      </ComposerTrigger>

      <ComposerContent>
        <ComposerChannel value="email" label="Email">
          <EmailComposer
            ref="emailComposer"
            v-model="body"
            v-model:recipients="recipients"
            v-model:quoted="quoted"
            :fields="['cc', 'bcc']"
            :submit-label="label"
            :placeholder="placeholder || 'Type a message'"
            :search-recipients="searchRecipients"
            :upload-function="uploadAttachment"
            @submit="sendReply"
            @remove-attachment="onRemoveAttachment"
          >
            <template v-if="hasMultipleSenders" #from>
              <ComposerFromPicker v-model="fromEmail" :options="from" />
            </template>
          </EmailComposer>
        </ComposerChannel>

        <ComposerChannel value="comment" label="Comment">
          <CommentComposer
            ref="commentComposer"
            :mentions="dropdown"
            :upload-function="uploadAttachment"
            @submit="sendComment"
            @remove-attachment="onRemoveAttachment"
          >
          </CommentComposer>
        </ComposerChannel>
      </ComposerContent>
    </Composer>
  </template>
</template>

<script setup lang="ts">
import {
  CommentComposer,
  Composer,
  ComposerChannel,
  ComposerContent,
  ComposerTrigger,
  EmailComposer,
} from "@framework/ui/components/Composer";
import type {
  CommentPayload,
  EmailPayload,
  Recipient,
  Recipients,
  UploadedFile,
} from "@framework/ui/components/Composer";
import ComposerFromPicker from "./ComposerFromPicker.vue";
import { useTyping } from "@/composables/realtime";
import { getUserEmailInfo } from "@/composables/useUserEmailInfo";
import { useAgentStore } from "@/stores/agent";
import { useAuthStore } from "@/stores/auth";
import {
  htmlToText,
  removeAttachmentFromServer,
  uploadFunction,
} from "@/utils";
import { useStorage } from "@vueuse/core";
import { Avatar, call, createResource, toast } from "frappe-ui";
import { useOnboarding } from "frappe-ui/frappe";
import { storeToRefs } from "pinia";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps({
  ticketId: { type: String, default: null },
  placeholder: { type: String, default: null },
  label: { type: String, default: "Send" },
  doctype: { type: String, default: "HD Ticket" },
  toEmails: { type: Array as () => string[], default: () => [] },
  ccEmails: { type: Array as () => string[], default: () => [] },
  bccEmails: { type: Array as () => string[], default: () => [] },
});

const emit = defineEmits(["submit"]);

const { isManager } = useAuthStore();
const { updateOnboardingStep } = useOnboarding("helpdesk");
const { onUserType, cleanup } = useTyping(props.ticketId);
onBeforeUnmount(() => cleanup());

// ─── Window + channel state ───────────────────────────────────────────
const isOpen = ref(false);
const channel = ref("email");

const emailComposer = ref<InstanceType<typeof EmailComposer> | null>(null);
const commentComposer = ref<InstanceType<typeof CommentComposer> | null>(null);

const isCommentActive = computed(() => channel.value === "comment");
const activeEditor = computed(() =>
  isCommentActive.value
    ? commentComposer.value?.editor
    : emailComposer.value?.editor
);

// R → reply (email), C → comment — only when no input/editor is focused.
function onComposerShortcut(e: KeyboardEvent) {
  const target = e.target as HTMLElement;
  if (target.closest("input, textarea, [contenteditable], select")) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "r" || e.key === "R") channel.value = "email";
  else if (e.key === "c" || e.key === "C") channel.value = "comment";
  else return;
  isOpen.value = true;
}
onMounted(() => document.addEventListener("keydown", onComposerShortcut));
onBeforeUnmount(() =>
  document.removeEventListener("keydown", onComposerShortcut)
);

// Agent @-mentions for the comment channel. Lazily loaded from the shared store.
const { agents: agentsList, dropdown } = storeToRefs(useAgentStore());
onMounted(() => {
  const a = agentsList.value;
  if (a.loading || a.data?.length || a.list?.promise) return;
  a.fetch();
});

// ─── Draft body, recipients, quoted reply ─────────────────────────────
// Plain email strings become bare recipients; names/avatars fill in from search.
const toRecipients = (emails: string[]): Recipient[] =>
  (emails || []).map((email) => ({ email }));

const recipients = ref<Recipients>({
  to: toRecipients(props.toEmails),
  cc: toRecipients(props.ccEmails),
  bcc: toRecipients(props.bccEmails),
});

// Quoted reply HTML, seeded by addToReply and cleared by the composer's reset.
const quoted = ref<string | null>(null);

// Persist the in-progress reply per ticket. The body is the source of truth
// (v-model with the composer); we seed it from storage and mirror edits back,
// dropping an untouched signature so it isn't kept as a draft.
const cachedBody = useStorage<string | null>(
  `emailBoxContent${props.ticketId}`,
  null
);
const body = ref(cachedBody.value ?? "");

// ─── From / signature, from the current agent's email info ────────────
const userResource = getUserEmailInfo();
const emailSignature = computed<string | null>(() =>
  userResource.data?.email_signature
    ? `<br>${userResource.data.email_signature}`
    : null
);

function isOnlySignature(content: string) {
  if (!content || !emailSignature.value) return false;
  return htmlToText(content) === htmlToText(emailSignature.value);
}

// Seed a fresh email draft with the signature. Called explicitly wherever a
// fresh draft should start with it, rather than via a single watcher.
function seedSignature() {
  if (emailSignature.value) body.value = emailSignature.value;
}

watch(body, (value, old) => {
  if (value !== old && value) onUserType();
  cachedBody.value = isOnlySignature(value) ? null : value;
});

// Seed after the signature resolves, and when switching back to an empty email.
watch(
  [emailSignature, channel],
  () => {
    if (channel.value === "email" && !body.value) seedSignature();
  },
  { immediate: true }
);

const outgoingEmails = computed<{ email_account: string; email_id: string }[]>(
  () => userResource.data?.outgoing_emails ?? []
);

const from = computed(() => {
  if (
    outgoingEmails.value.length <= 1 &&
    outgoingEmails.value[0]?.email_id === userResource.data?.email
  )
    return [];
  return outgoingEmails.value.map((e) => ({
    label: `${e.email_account} <${e.email_id}>`,
    value: e.email_id,
  }));
});
const hasMultipleSenders = computed(() => from.value.length > 1);

const fromEmail = useStorage<string>("from-email", "");
const selectedFromEmail = computed(() =>
  outgoingEmails.value.find((e) => e.email_id === fromEmail.value)
);

watch(
  from,
  (options) => {
    if (!options.find((f) => f.value === fromEmail.value)) {
      fromEmail.value = options.length ? options[0].value : "";
    }
  },
  { immediate: true }
);

// ─── Recipient search → helpdesk contact directory ────────────────────
// search_contacts is `@frappe.whitelist(methods=["GET"])`, so it must be a
// GET — frappe-ui's call() is POST-only and the server rejects it with 403.
const contactSearch = createResource({
  url: "helpdesk.api.contact.search_contacts",
  method: "GET",
  transform: (
    data: { full_name?: string; email_id?: string; name?: string }[]
  ): Recipient[] =>
    (data || []).map((c) => ({
      email: c.email_id || c.name || "",
      label: c.full_name || c.email_id || c.name,
    })),
});

async function searchRecipients(query: string): Promise<Recipient[]> {
  return (await contactSearch.fetch({ txt: query || "" })) ?? [];
}

// ─── Attachments ──────────────────────────────────────────────────────
const uploadAttachment = (file: File) =>
  uploadFunction(file, props.doctype, props.ticketId);

async function onRemoveAttachment(file: UploadedFile) {
  await removeAttachmentFromServer(file.name);
}

// ─── Send ─────────────────────────────────────────────────────────────
const emails = (list: Recipient[]) => list.map((r) => r.email).join(",");

async function sendReply(payload: EmailPayload) {
  try {
    await call("run_doc_method", {
      dt: props.doctype,
      dn: props.ticketId,
      method: "reply_via_agent",
      args: {
        attachments: payload.attachments.map((a) => a.name),
        from_email: selectedFromEmail.value,
        to: emails(payload.recipients.to),
        cc: emails(payload.recipients.cc),
        bcc: emails(payload.recipients.bcc),
        message: payload.body,
      },
    });
  } catch (error) {
    toast.error(__("Failed to send the email. Please try again."));
    return; // keep the draft — we don't reset on failure.
  }
  emailComposer.value?.reset();
  isOpen.value = false;
  seedSignature(); // so the next reply starts with it again
  emit("submit");
  if (isManager) updateOnboardingStep("reply_on_ticket");
}

// new_comment attaches by file_url, so pass the full attachment objects.
async function sendComment(payload: CommentPayload) {
  try {
    await call("run_doc_method", {
      dt: props.doctype,
      dn: props.ticketId,
      method: "new_comment",
      args: { content: payload.body, attachments: payload.attachments },
    });
  } catch (error) {
    toast.error(__("Failed to add the comment. Please try again."));
    return; // keep the draft — we don't reset on failure.
  }
  commentComposer.value?.reset();
  isOpen.value = false;
  emit("submit");
  if (isManager) updateOnboardingStep("comment_on_ticket");
}

// ─── Surface CommunicationArea drives ─────────────────────────────────
function addToReply(
  content: string,
  to: string[],
  cc: string[],
  bcc: string[]
) {
  channel.value = "email"; // a reply is always email
  recipients.value = {
    to: toRecipients(to),
    cc: toRecipients(cc),
    bcc: toRecipients(bcc),
  };
  quoted.value = content;
  body.value = "";
  seedSignature();
  isOpen.value = true;
}

function submitMail() {
  if (isCommentActive.value) commentComposer.value?.submit();
  else emailComposer.value?.submit();
}

defineExpose({ addToReply, submitMail, editor: activeEditor });
</script>
