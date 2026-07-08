<template>
  <div class="flex h-full flex-col">
    <LayoutHeader>
      <template #left-header>
        <div class="text-md-medium text-ink-gray-9">Composer Playground</div>
      </template>
    </LayoutHeader>

    <div class="flex-1 overflow-y-auto p-6">
      <div class="mx-auto max-w-3xl space-y-4">
        <!-- One example at a time, so each configuration can be poked at in
             isolation. The library's own story shows them all at once. -->
        <TabButtons v-model="activeTab" :options="tabs" />

        <!-- ── Configurable two-channel window ─────────────────────────────── -->
        <template v-if="activeTab === 'configurable'">
          <!-- Live controls bound to the composer below. -->
          <section class="rounded-lg border border-outline-gray-2 p-4">
            <div class="mb-3 text-sm-medium text-ink-gray-7">Controls</div>
            <div class="flex flex-wrap items-center gap-x-8 gap-y-4">
              <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
                <Switch v-model="open" label="open" size="sm" />
                <Switch v-model="minimizable" label="minimizable" size="sm" />
                <Switch v-model="floatable" label="floatable" size="sm" />
                <div class="flex items-center gap-2">
                  <span class="text-p-sm text-ink-gray-6">mode</span>
                  <Select v-model="mode" :options="modeOptions" />
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-p-sm text-ink-gray-6">fields</span>
                <Checkbox v-model="fieldSubject" label="subject" />
                <Checkbox v-model="fieldCc" label="cc" />
                <Checkbox v-model="fieldBcc" label="bcc" />
              </div>
            </div>
            <div
              class="mt-4 flex flex-wrap items-center gap-2 border-t border-outline-gray-1 pt-4"
            >
              <span class="mr-1 text-p-sm text-ink-gray-6">actions</span>
              <Button label="Focus" @click="focusActive" />
              <Button label="Reset" @click="resetActive" />
              <Button label="Submit" @click="submitActive" />
              <Button label="Seed quoted reply" @click="seedReply" />
              <span class="ml-auto text-p-sm text-ink-gray-5">
                open: <b>{{ open }}</b> · channel: <b>{{ channel }}</b> · mode:
                <b>{{ mode }}</b>
              </span>
            </div>
          </section>

          <Composer
            v-model:open="open"
            v-model:channel="channel"
            v-model:mode="mode"
            :minimizable="minimizable"
          >
            <ComposerTrigger placeholder="Write a reply…" />
            <ComposerContent :floatable="floatable">
              <ComposerChannel value="email" label="Email">
                <EmailComposer
                  ref="emailRef"
                  v-model="emailBody"
                  v-model:recipients="recipients"
                  v-model:subject="subject"
                  v-model:quoted="quoted"
                  :fields="fields"
                  :search-recipients="searchContacts"
                  :upload-function="mockUpload"
                  submit-label="Send"
                  placeholder="Write a reply…"
                  @submit="onEmail"
                  @remove-attachment="(f) => log('email:remove-attachment', f)"
                >
                  <template #from>
                    <div class="flex items-center gap-2 py-1.5 px-2.5">
                      <span class="text-p-sm text-ink-gray-5">From</span>
                      <Select v-model="fromEmail" :options="identities" />
                    </div>
                  </template>
                </EmailComposer>
              </ComposerChannel>

              <ComposerChannel value="comment" label="Comment">
                <CommentComposer
                  ref="commentRef"
                  v-model="commentBody"
                  :mentions="mentions"
                  :upload-function="mockUpload"
                  placeholder="Leave an internal note — type @ to mention…"
                  @submit="onComment"
                  @remove-attachment="
                    (f) => log('comment:remove-attachment', f)
                  "
                />
              </ComposerChannel>
            </ComposerContent>
          </Composer>
        </template>

        <!-- ── Inline (no window) ──────────────────────────────────────────── -->
        <div
          v-else-if="activeTab === 'inline'"
          class="grid gap-4 md:grid-cols-2"
        >
          <div
            class="rounded-md border border-outline-gray-2 bg-surface-white p-2"
          >
            <EmailComposer
              v-model="inlineBody"
              v-model:recipients="inlineRecipients"
              :fields="['cc']"
              :search-recipients="searchContacts"
              :upload-function="mockUpload"
              placeholder="Compose an email…"
              @submit="onEmail"
            />
          </div>
          <div
            class="rounded-md border border-outline-gray-2 bg-surface-white p-2"
          >
            <CommentComposer
              v-model="inlineComment"
              :mentions="mentions"
              :upload-function="mockUpload"
              placeholder="Write a comment…"
              @submit="onComment"
            />
          </div>
        </div>

        <!-- ── Pinned open (minimizable = false) ───────────────────────────── -->
        <Composer
          v-else-if="activeTab === 'pinned'"
          :open="true"
          :minimizable="false"
        >
          <ComposerContent>
            <ComposerChannel value="email" label="Email">
              <EmailComposer
                v-model:recipients="pinnedRecipients"
                :fields="['cc', 'bcc', 'subject']"
                :search-recipients="searchContacts"
                :upload-function="mockUpload"
                placeholder="Always-open composer, no trigger or minimize…"
                @submit="onEmail"
              />
            </ComposerChannel>
          </ComposerContent>
        </Composer>

        <!-- ── Custom window controls (#header-actions) ────────────────────── -->
        <Composer v-else-if="activeTab === 'header'">
          <ComposerTrigger placeholder="Reply…" />
          <ComposerContent>
            <template #header-actions="{ expand, minimize, floating }">
              <Button
                variant="ghost"
                :label="floating ? 'Dock' : 'Pop out'"
                @click="expand"
              />
              <Button variant="ghost" label="Done" @click="minimize" />
            </template>
            <ComposerChannel value="comment" label="Comment">
              <CommentComposer
                :mentions="mentions"
                placeholder="Custom header controls…"
                @submit="onComment"
              />
            </ComposerChannel>
          </ComposerContent>
        </Composer>

        <!-- ── Custom collapsed bar (ComposerTrigger default slot) ─────────── -->
        <Composer v-else-if="activeTab === 'trigger'">
          <ComposerTrigger v-slot="{ preview }">
            <Avatar size="sm" label="Ada Lovelace" class="shrink-0" />
            <span
              class="min-w-0 max-w-[30%] truncate text-base text-ink-gray-5"
            >
              {{ preview || "Reply as Ada…" }}
            </span>
          </ComposerTrigger>
          <ComposerContent>
            <ComposerChannel value="comment" label="Comment">
              <CommentComposer
                :mentions="mentions"
                placeholder="Custom trigger avatar + preview…"
                @submit="onComment"
              />
            </ComposerChannel>
          </ComposerContent>
        </Composer>

        <!-- ── Code for whichever example is active ────────────────────────── -->
        <div class="pt-2 text-sm-medium text-ink-gray-7">Code</div>
        <pre
          class="mt-2 overflow-auto rounded-lg bg-surface-gray-2 p-3 text-xs text-ink-gray-8"
        ><code>{{ activeCode }}</code></pre>

        <!-- ── Event log (persists across tabs) ────────────────────────────── -->
        <div class="pt-2 text-sm-medium text-ink-gray-7">Events</div>
        <pre
          class="mt-2 max-h-64 overflow-auto rounded-lg bg-surface-gray-2 p-3 text-xs text-ink-gray-8"
          >{{
            events.length
              ? events.join("\n")
              : "— interact with a composer to see submit / attachment events —"
          }}</pre
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import LayoutHeader from "@/components/LayoutHeader.vue";
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
  Field,
  MentionOption,
  Recipient,
  Recipients,
  UploadedFile,
  UploadFunction,
} from "@framework/ui/components/Composer";
import {
  Avatar,
  Button,
  Checkbox,
  Select,
  Switch,
  TabButtons,
} from "frappe-ui";
import { type WindowMode } from "frappe-ui/experimental";
import { computed, ref } from "vue";

// ── Which example is on screen ───────────────────────────────────────────
const tabs = [
  { label: "Configurable", value: "configurable" },
  { label: "Inline", value: "inline" },
  { label: "Pinned open", value: "pinned" },
  { label: "Custom header", value: "header" },
  { label: "Custom trigger", value: "trigger" },
];
const activeTab = ref("configurable");

// ── Window controls (bound to the configurable composer) ─────────────────
const open = ref(false);
const minimizable = ref(true);
const floatable = ref(true);
const mode = ref<WindowMode>("docked");
const modeOptions: WindowMode[] = ["docked", "floating", "minimized"];

// ── Optional email rows the configurable composer offers ─────────────────
const fieldSubject = ref(true);
const fieldCc = ref(true);
const fieldBcc = ref(false);
const fields = computed<Field[]>(() =>
  (
    [
      ["subject", fieldSubject.value],
      ["cc", fieldCc.value],
      ["bcc", fieldBcc.value],
    ] as const
  )
    .filter(([, on]) => on)
    .map(([name]) => name)
);

// ── Draft state (host-owned via v-model, survives channel switches) ──────
const channel = ref("email");
const emailBody = ref("");
const commentBody = ref("");
const subject = ref("");
const quoted = ref<string | null>(null);
const recipients = ref<Recipients>({
  to: [{ email: "grace@example.com", label: "Grace Hopper" }],
  cc: [],
  bcc: [],
});

// Each standalone example binds its own recipients — an unbound recipients
// model does not surface added chips.
const inlineBody = ref("");
const inlineComment = ref("");
const inlineRecipients = ref<Recipients>({ to: [], cc: [], bcc: [] });
const pinnedRecipients = ref<Recipients>({ to: [], cc: [], bcc: [] });

// ── Imperative handle (exposed focus / reset / submit) ───────────────────
const emailRef = ref<InstanceType<typeof EmailComposer> | null>(null);
const commentRef = ref<InstanceType<typeof CommentComposer> | null>(null);
const activeComposer = computed(() =>
  channel.value === "comment" ? commentRef.value : emailRef.value
);
function focusActive() {
  activeComposer.value?.focus();
}
function resetActive() {
  activeComposer.value?.reset();
}
function submitActive() {
  activeComposer.value?.submit();
}
function seedReply() {
  channel.value = "email";
  quoted.value =
    "<p>On Tue, Grace wrote:</p><p>Can we ship the composer this week?</p>";
  open.value = true;
}

// ── Host-supplied sender picker for the #from slot ───────────────────────
const identities = ["support@example.com", "sales@example.com"];
const fromEmail = ref(identities[0]);

// ── Mocked transports (a real host wires these to its backend) ───────────
const mockUpload: UploadFunction = async (file) => {
  await new Promise((resolve) => setTimeout(resolve, 600));
  return {
    name: `mock-${Date.now()}`,
    file_name: file.name,
    file_url: URL.createObjectURL(file),
    file_size: file.size,
    file_type: file.type,
  };
};

const directory: Recipient[] = [
  { label: "Grace Hopper", email: "grace@example.com" },
  { label: "Ada Lovelace", email: "ada@example.com" },
  { label: "Alan Turing", email: "alan@example.com" },
  { label: "Katherine Johnson", email: "katherine@example.com" },
];
async function searchContacts(query: string): Promise<Recipient[]> {
  const text = query.trim().toLowerCase();
  if (!text) return directory;
  return directory.filter(
    (person) =>
      person.label!.toLowerCase().includes(text) ||
      person.email.toLowerCase().includes(text)
  );
}

const mentions: MentionOption[] = [
  { label: "Grace Hopper", value: "grace@example.com" },
  { label: "Ada Lovelace", value: "ada@example.com" },
  { label: "Alan Turing", value: "alan@example.com" },
];

// ── Code shown under the active tab ───────────────────────────────────────
// Representative usage per example, not a literal dump of this page's own
// wiring (which carries playground-only bits like the event log).
const codeByTab: Record<string, string> = {
  configurable: `<Composer v-model:open="open" v-model:channel="channel">
  <ComposerTrigger placeholder="Write a reply…" />
  <ComposerContent>
    <ComposerChannel value="email" label="Email">
      <EmailComposer
        v-model="body"
        v-model:recipients="recipients"
        v-model:subject="subject"
        v-model:quoted="quoted"
        :fields="['subject', 'cc']"
        :search-recipients="searchContacts"
        :upload-function="uploadFile"
        @submit="onEmailSubmit"
      >
        <template #from>
          <SenderPicker v-model="fromEmail" :options="identities" />
        </template>
      </EmailComposer>
    </ComposerChannel>

    <ComposerChannel value="comment" label="Comment">
      <CommentComposer
        v-model="commentBody"
        :mentions="mentions"
        @submit="onCommentSubmit"
      />
    </ComposerChannel>
  </ComposerContent>
</Composer>`,

  inline: `<!-- No Composer / ComposerContent — renders in normal document flow. -->
<EmailComposer
  v-model="body"
  v-model:recipients="recipients"
  :fields="['cc']"
  :search-recipients="searchContacts"
  @submit="onSubmit"
/>

<CommentComposer v-model="commentBody" :mentions="mentions" @submit="onSubmit" />`,

  pinned: `<!-- minimizable="false" pins the window open: no trigger, no way to
     collapse it back — used where the composer should always be visible. -->
<Composer :open="true" :minimizable="false">
  <ComposerContent>
    <ComposerChannel value="email" label="Email">
      <EmailComposer
        v-model:recipients="recipients"
        :fields="['cc', 'bcc', 'subject']"
        :search-recipients="searchContacts"
        @submit="onSubmit"
      />
    </ComposerChannel>
  </ComposerContent>
</Composer>`,

  header: `<Composer>
  <ComposerTrigger placeholder="Reply…" />
  <ComposerContent>
    <template #header-actions="{ expand, minimize, floating }">
      <Button :label="floating ? 'Dock' : 'Pop out'" @click="expand" />
      <Button label="Done" @click="minimize" />
    </template>
    <ComposerChannel value="comment" label="Comment">
      <CommentComposer :mentions="mentions" @submit="onSubmit" />
    </ComposerChannel>
  </ComposerContent>
</Composer>`,

  trigger: `<Composer>
  <ComposerTrigger v-slot="{ preview }">
    <Avatar size="sm" label="Ada Lovelace" />
    <span class="min-w-0 max-w-[30%] truncate">{{ preview || 'Reply as Ada…' }}</span>
  </ComposerTrigger>
  <ComposerContent>
    <ComposerChannel value="comment" label="Comment">
      <CommentComposer :mentions="mentions" @submit="onSubmit" />
    </ComposerChannel>
  </ComposerContent>
</Composer>`,
};
const activeCode = computed(() => codeByTab[activeTab.value] ?? "");

// ── Event log ────────────────────────────────────────────────────────────
const events = ref<string[]>([]);
function log(
  name: string,
  payload?: EmailPayload | CommentPayload | UploadedFile
) {
  const time = new Date().toLocaleTimeString();
  events.value.unshift(
    `[${time}] ${name}${payload ? " " + JSON.stringify(payload) : ""}`
  );
}
function onEmail(payload: EmailPayload) {
  log("email:submit", payload);
}
function onComment(payload: CommentPayload) {
  log("comment:submit", payload);
}
</script>
