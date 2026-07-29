<template>
  <div class="mx-auto w-full max-w-[520px] px-5 py-10">
    <h1 class="text-lg font-semibold text-ink-gray-9">Create new ticket</h1>

    <div class="mt-6 flex flex-col gap-5">
      <!-- Subject -->
      <div>
        <label class="mb-1.5 block text-p-sm text-ink-gray-5">
          Subject<span class="text-ink-red-3"> *</span>
        </label>
        <TextInput
          v-model="subject"
          size="md"
          placeholder="A short description"
        />
      </div>

      <!-- Suggested articles based on the subject (client-side, RediSearch is off) -->
      <div v-if="showSuggestions" class="rounded-lg bg-surface-gray-2 p-3">
        <div class="mb-1 flex items-center justify-between px-1">
          <span class="text-p-sm text-ink-gray-5">
            Suggested articles based on your subject
          </span>
          <button
            type="button"
            class="text-p-sm text-ink-blue-3 hover:underline"
            @click="seeAll"
          >
            See all
          </button>
        </div>
        <button
          v-for="article in suggestions"
          :key="article.name"
          type="button"
          class="flex w-full items-start gap-3 rounded-md px-1 py-2 text-left hover:bg-surface-white"
          @click="openArticle(article.name)"
        >
          <div
            class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border border-outline-gray-1 bg-surface-white text-ink-gray-6"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" class="size-4">
              <path
                d="M11 1C12.6569 1 14 2.34315 14 4V12.5C14 13.8807 12.8807 15 11.5 15H4.5C3.11929 15 2 13.8807 2 12.5V3.5C2 2.11929 3.11929 1 4.5 1H11ZM4.5 2C3.67157 2 3 2.67157 3 3.5V12.5C3 13.3284 3.67157 14 4.5 14H11.5C12.3284 14 13 13.3284 13 12.5V4C13 2.89543 12.1046 2 11 2H4.5ZM10.75 10.5C11.0261 10.5 11.25 10.7239 11.25 11C11.25 11.2761 11.0261 11.5 10.75 11.5H5.25C4.97386 11.5 4.75 11.2761 4.75 11C4.75 10.7239 4.97386 10.5 5.25 10.5H10.75ZM10.75 7.5C11.0261 7.5 11.25 7.72386 11.25 8C11.25 8.27614 11.0261 8.5 10.75 8.5H5.25C4.97386 8.5 4.75 8.27614 4.75 8C4.75 7.72386 4.97386 7.5 5.25 7.5H10.75ZM10.75 4.5C11.0261 4.5 11.25 4.72386 11.25 5C11.25 5.27614 11.0261 5.5 10.75 5.5H5.25C4.97386 5.5 4.75 5.27614 4.75 5C4.75 4.72386 4.97386 4.5 5.25 4.5H10.75Z"
              />
            </svg>
          </div>
          <div class="min-w-0">
            <div class="truncate text-base font-medium text-ink-gray-8">
              {{ article.title }}
            </div>
            <div class="line-clamp-1 text-p-sm text-ink-gray-5">
              {{ snippet(article.name) }}
            </div>
          </div>
        </button>
      </div>

      <!-- Template fields (reference / sub-reference share a row, per the mockup) -->
      <div v-for="(row, index) in fieldRows" :key="index" class="flex gap-4">
        <div v-for="field in row" :key="field.fieldname" class="min-w-0 flex-1">
          <label class="mb-1.5 block text-p-sm text-ink-gray-5">
            {{ field.label
            }}<span v-if="field.required" class="text-ink-red-3"> *</span>
          </label>
          <Autocomplete
            v-if="field.fieldtype === 'Link'"
            :options="linkOptions[field.options] || []"
            :modelValue="wrapValue(model[field.fieldname])"
            :placeholder="field.placeholder || ''"
            @update:modelValue="(option) => setField(field.fieldname, option)"
          />
          <FormControl
            v-else-if="field.fieldtype === 'Select'"
            v-model="model[field.fieldname]"
            type="select"
            :options="selectOptions(field)"
          />
          <TextInput
            v-else
            v-model="model[field.fieldname]"
            :placeholder="field.placeholder || ''"
          />
        </div>
      </div>

      <!-- Attachment -->
      <div>
        <label class="mb-1.5 block text-p-sm text-ink-gray-5">Attachment</label>
        <FileUploader @success="onUpload">
          <template #default="{ uploading, openFileSelector }">
            <div
              class="flex items-center justify-between rounded-lg border border-outline-gray-2 py-1 pe-1 ps-3"
            >
              <div class="flex min-w-0 items-center gap-2 text-ink-gray-5">
                <FeatherIcon name="upload" class="size-4 shrink-0" />
                <span class="truncate text-base">{{
                  attachmentName || "Choose file"
                }}</span>
              </div>
              <Button
                variant="subtle"
                :loading="uploading"
                @click="openFileSelector"
              >
                Upload file
              </Button>
            </div>
          </template>
        </FileUploader>
      </div>

      <!-- Description -->
      <div>
        <label class="mb-1.5 block text-p-sm text-ink-gray-5"
          >Description</label
        >
        <TextEditor
          :content="description"
          :fixed-menu="EDITOR_MENU"
          :placeholder="'Detailed explanation'"
          editor-class="prose-sm max-h-[16rem] min-h-[7rem] overflow-y-auto px-3 py-2"
          class="rounded-lg border border-outline-gray-2"
          @change="(html) => (description = html)"
        />
      </div>

      <p class="text-p-sm text-ink-gray-6">
        If you don't find your site,
        <a :href="registerUrl" class="text-ink-gray-8 underline">click here</a>
        to register the site for support.
      </p>

      <Button
        class="w-full"
        size="lg"
        variant="solid"
        theme="gray"
        :loading="ticket.loading"
        :disabled="!canSubmit"
        @click="createTicket"
      >
        Create ticket
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
// Customer "New ticket" form for the Knowledge Base Studio app. Fields are driven
// by the HD Ticket Template (get_one), so editing the template changes this form.
// Built on frappe-ui primitives; submits via the same hd_ticket.api.new the desk
// portal uses. Article suggestions are matched client-side (RediSearch is off on
// this bench), reusing the KbSearch approach.
import { computed, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  Autocomplete,
  Button,
  createResource,
  FeatherIcon,
  FileUploader,
  FormControl,
  TextEditor,
  TextInput,
  toast,
} from "frappe-ui";

withDefaults(defineProps<{ registerUrl?: string }>(), { registerUrl: "#" });

const router = useRouter();
const MIN_QUERY = 3;
const PAIR = ["reference_module", "sub_reference_module"];
const EDITOR_MENU = [
  "Bold",
  "Italic",
  "Strikethrough",
  "Underline",
  "Blockquote",
  "Image",
  "Link",
  "Numbered List",
  "Bullet List",
];

const subject = ref("");
const description = ref("");
const attachmentName = ref("");
const attachments = ref<any[]>([]);
const model = reactive<Record<string, string>>({});
const linkOptions = reactive<
  Record<string, { label: string; value: string }[]>
>({});

// Template — its fields decide what the form renders.
const template = createResource({
  url: "helpdesk.helpdesk.doctype.hd_ticket_template.api.get_one",
  params: { name: "Default" },
  auto: true,
  onSuccess: (data: any) => {
    (data.fields || []).forEach((field: any) => {
      if (!(field.fieldname in model)) model[field.fieldname] = "";
      if (field.fieldtype === "Link") ensureLinkOptions(field.options);
    });
  },
});

const visibleFields = computed(() =>
  (template.data?.fields || []).filter((f: any) => !f.hide_from_customer)
);

// Group the reference/sub-reference pair into one two-column row.
const fieldRows = computed(() => {
  const rows: any[][] = [];
  const fields = visibleFields.value;
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const next = fields[i + 1];
    if (
      PAIR.includes(field.fieldname) &&
      next &&
      PAIR.includes(next.fieldname)
    ) {
      rows.push([field, next]);
      i++;
    } else {
      rows.push([field]);
    }
  }
  return rows;
});

function selectOptions(field: any) {
  const options = (field.options || "")
    .split("\n")
    .map((o: string) => o.trim())
    .filter(Boolean);
  return ["", ...options];
}

function wrapValue(value: string) {
  return value ? { label: value, value } : null;
}

function setField(fieldname: string, option: any) {
  model[fieldname] = option?.value || "";
}

function ensureLinkOptions(doctype: string) {
  if (!doctype || linkOptions[doctype]) return;
  linkOptions[doctype] = [];
  createResource({
    url: "frappe.client.get_list",
    params: { doctype, fields: ["name"], limit_page_length: 0 },
    auto: true,
    onSuccess: (rows: any[]) => {
      linkOptions[doctype] = rows.map((r) => ({
        label: r.name,
        value: r.name,
      }));
    },
  });
}

// Article suggestions ------------------------------------------------------
const articles = createResource({
  url: "frappe.client.get_list",
  params: {
    doctype: "HD Article",
    filters: { status: "Published" },
    fields: ["name", "title", "content"],
    limit_page_length: 0,
  },
  auto: true,
});

const contentByName = computed(() => {
  const map = new Map<string, string>();
  for (const article of articles.data || []) {
    const text = (article.content || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    map.set(article.name, text);
  }
  return map;
});

const suggestions = computed(() => {
  const needle = subject.value.trim().toLowerCase();
  if (needle.length < MIN_QUERY) return [];
  return (articles.data || [])
    .filter((article: any) => {
      const haystack = `${article.title || ""} ${
        contentByName.value.get(article.name) || ""
      }`.toLowerCase();
      return haystack.includes(needle);
    })
    .slice(0, 3);
});

const showSuggestions = computed(() => suggestions.value.length > 0);

function snippet(name: string) {
  const text = contentByName.value.get(name) || "";
  const needle = subject.value.trim().toLowerCase();
  const index = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (index < 0) return text.slice(0, 120);
  const start = Math.max(0, index - 40);
  return (start > 0 ? "…" : "") + text.slice(start, start + 120);
}

function openArticle(name: string) {
  router.push(`/articles/${name}`);
}

function seeAll() {
  router.push("/");
}

// Submit -------------------------------------------------------------------
function onUpload(file: any) {
  attachments.value.push({ name: file.name, file_url: file.file_url });
  attachmentName.value = file.file_name || file.name;
}

const descriptionEmpty = computed(
  () => description.value.replace(/<[^>]*>/g, "").trim().length === 0
);

const canSubmit = computed(() => {
  if (!subject.value.trim() || descriptionEmpty.value) return false;
  return visibleFields.value.every(
    (field: any) => !field.required || model[field.fieldname]
  );
});

const ticket = createResource({
  url: "helpdesk.helpdesk.doctype.hd_ticket.api.new",
  makeParams: () => ({
    doc: {
      subject: subject.value,
      description: description.value,
      template: "Default",
      ...model,
    },
    attachments: attachments.value,
  }),
  onSuccess: () => {
    toast.success("Ticket created");
    router.push("/customer-tickets");
  },
  onError: (error: any) => {
    toast.error(error?.messages?.[0] || "Could not create the ticket");
  },
});

function createTicket() {
  if (canSubmit.value) ticket.submit();
}

// Keep model keys in sync if the template reloads with new fields.
watch(visibleFields, (fields) => {
  fields.forEach((field: any) => {
    if (!(field.fieldname in model)) model[field.fieldname] = "";
  });
});
</script>
