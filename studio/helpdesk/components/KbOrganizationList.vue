<template>
  <div class="kb-org-list">
    <div class="kb-org-list__toolbar">
      <TextInput
        v-model="search"
        class="kb-org-list__search"
        type="text"
        placeholder="Search"
      >
        <template #prefix>
          <LucideSearch class="size-4 text-ink-gray-5" />
        </template>
      </TextInput>
      <!-- Temporary: lets the two candidate layouts be compared side by side. -->
      <div class="kb-org-list__toggle">
        <button
          v-for="option in layouts"
          :key="option.value"
          type="button"
          class="kb-org-list__toggle-button"
          :class="{ 'is-active': layout === option.value }"
          :aria-label="option.label"
          @click="layout = option.value"
        >
          <component :is="option.icon" class="size-4" />
        </button>
      </div>
    </div>

    <KbEmptyState
      v-if="!matches.length"
      icon="organization"
      :title="search ? 'No organizations found' : 'No organizations'"
      :description="
        search
          ? 'Change your search terms.'
          : `You'll see your organization here once someone adds you to one.`
      "
    />

    <template v-if="matches.length">
      <div v-if="layout === 'grid'" class="kb-org-list__grid">
        <div
          v-for="organization in matches"
          :key="organization.name"
          class="kb-org-list__card"
          role="button"
          tabindex="0"
          @click="onSelect?.(organization.name)"
          @keydown.enter="onSelect?.(organization.name)"
        >
          <div class="kb-org-list__card-top">
            <Avatar
              shape="square"
              size="3xl"
              :image="organization.image"
              :label="organization.customer_name"
            />
            <Badge
              v-if="organization.role"
              :label="organization.role"
              :theme="roleTheme(organization.role)"
              variant="outline"
            />
          </div>
          <div class="kb-org-list__card-name">
            {{ organization.customer_name }}
          </div>
          <div class="kb-org-list__domain">{{ organization.domain }}</div>
          <div class="kb-org-list__card-meta">
            <span class="kb-org-list__fact">
              <LucideTicket class="kb-org-list__icon" />
              {{ count(organization.open_ticket_count, "ticket") }}
            </span>
            <span class="kb-org-list__dot">·</span>
            <span class="kb-org-list__fact">
              <LucideSquareUser class="kb-org-list__icon" />
              {{ count(organization.member_count, "member") }}
            </span>
          </div>
        </div>
      </div>

      <div
        v-for="organization in matches"
        v-else
        :key="organization.name"
        class="kb-org-list__row"
        role="button"
        tabindex="0"
        @click="onSelect?.(organization.name)"
        @keydown.enter="onSelect?.(organization.name)"
      >
        <Avatar
          shape="square"
          size="xl"
          :image="organization.image"
          :label="organization.customer_name"
        />
        <div class="kb-org-list__text">
          <div class="kb-org-list__name">{{ organization.customer_name }}</div>
          <div class="kb-org-list__domain">{{ organization.domain }}</div>
        </div>
        <Badge
          v-if="organization.role"
          :label="organization.role"
          :theme="roleTheme(organization.role)"
          variant="outline"
        />
        <FeatherIcon
          name="chevron-right"
          class="size-4 shrink-0 text-ink-gray-5"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
// Two candidate layouts behind a toggle: rows sized like the agent portal's
// Settings > Agents panel, and a card grid. Either way each entry carries a role
// badge — Owner, Manager or Member — rather than being sorted into sections.
import { Avatar, Badge, FeatherIcon, TextInput } from "frappe-ui";
import LucideLayoutGrid from "~icons/lucide/layout-grid";
import LucideList from "~icons/lucide/list";
import LucideSearch from "~icons/lucide/search";
import LucideSquareUser from "~icons/lucide/square-user";
import LucideTicket from "~icons/lucide/ticket";
import { computed, ref } from "vue";
import KbEmptyState from "./KbEmptyState.vue";

type Organization = {
  name: string;
  customer_name: string;
  domain?: string;
  image?: string;
  role?: string;
  member_count?: number;
  open_ticket_count?: number;
};

const props = withDefaults(
  defineProps<{
    organizations?: Organization[];
    /** Called with the organization's docname when one is picked. */
    onSelect?: (name: string) => void;
  }>(),
  { organizations: () => [] }
);

const layouts = [
  { value: "list", label: "List view", icon: LucideList },
  { value: "grid", label: "Grid view", icon: LucideLayoutGrid },
];
const layout = ref("list");
const search = ref("");

const matches = computed(() => {
  const query = search.value.trim().toLowerCase();
  if (!query) return props.organizations;
  return props.organizations.filter((organization) =>
    `${organization.customer_name} ${organization.domain || ""}`
      .toLowerCase()
      .includes(query)
  );
});

// Owner and Manager both act on the organization, so they get colour; a plain
// member stays neutral.
const ROLE_THEMES = { Owner: "blue", Manager: "green" };

function roleTheme(role: string) {
  return ROLE_THEMES[role] || "gray";
}

function count(total: number | undefined, noun: string) {
  return `${total || 0} ${total === 1 ? noun : noun + "s"}`;
}
</script>

<style scoped>
/* Plain CSS: this app sits outside the bench's Tailwind content globs, so only
   utilities the rest of the bundle already uses are safe here. */
.kb-org-list__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
}

.kb-org-list__search {
  flex: 1;
}

.kb-org-list__toggle {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: var(--surface-gray-2);
}

.kb-org-list__toggle-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: var(--ink-gray-5);
  cursor: pointer;
}

.kb-org-list__toggle-button.is-active {
  background: var(--surface-elevation-1);
  box-shadow: var(--elevation-sm);
  color: var(--ink-gray-8);
}

.kb-org-list__row {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 56px;
  padding: 0 8px;
  border-radius: 6px;
  cursor: pointer;
}

.kb-org-list__row + .kb-org-list__row {
  border-top: 1px solid var(--outline-gray-1);
}

.kb-org-list__row:hover {
  background: var(--surface-gray-2);
}

.kb-org-list__text {
  flex: 1;
  min-width: 0;
}

.kb-org-list__name,
.kb-org-list__domain,
.kb-org-list__card-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kb-org-list__name {
  font-size: 14px;
  line-height: 20px;
  color: var(--ink-gray-8);
}

.kb-org-list__domain {
  margin-top: 2px;
  font-size: 14px;
  line-height: 20px;
  color: var(--ink-gray-5);
}

.kb-org-list__grid {
  display: grid;
  /* Wide enough that "n tickets · n members" stays on one line. */
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 12px;
}

.kb-org-list__card {
  padding: 16px;
  border: 1px solid var(--outline-gray-1);
  border-radius: 10px;
  cursor: pointer;
  transition: box-shadow 150ms ease, border-color 150ms ease;
}

/* The elevation tokens draw their own hairline, so the resting border has to
   give way on hover — keeping both double-draws the edge instead of lifting. */
.kb-org-list__card:hover {
  border-color: transparent;
  background: var(--surface-elevation-1);
  box-shadow: var(--elevation-md);
}

.kb-org-list__card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.kb-org-list__card-name {
  font-size: 15px;
  line-height: 20px;
  font-weight: 600;
  color: var(--ink-gray-9);
}

.kb-org-list__card-meta {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--outline-gray-1);
  font-size: 13px;
  line-height: 18px;
  color: var(--ink-gray-5);
}

/* Icon then value, dot between the pairs — the agent portal's PageInfo row. */
.kb-org-list__card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.kb-org-list__fact {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.kb-org-list__icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.kb-org-list__dot {
  color: var(--ink-gray-4);
}
</style>
