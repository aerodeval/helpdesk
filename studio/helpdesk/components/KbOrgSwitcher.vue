<template>
  <!-- One width for the trigger and its menu: organization names vary in length,
       so a hugging trigger made the control resize on every switch. -->
  <Dropdown :options="options" align="start" match-trigger-width>
    <Button
      class="kb-org-switcher"
      size="sm"
      variant="subtle"
      :label="activeLabel"
    >
      <template #prefix>
        <!-- "All organizations" has no logo, and an initial for it would read as
             an organization named A. -->
        <Avatar
          v-if="active"
          size="xs"
          shape="square"
          :image="active.image"
          :label="activeLabel"
        />
        <LucideBuilding2 v-else class="size-4 text-ink-gray-5" />
      </template>
      <template #suffix>
        <FeatherIcon name="chevron-down" class="size-3.5 text-ink-gray-5" />
      </template>
    </Button>
  </Dropdown>
</template>

<script setup lang="ts">
// Organization switcher for the portal ticket list: the caller's organizations,
// one at a time, narrowing the list to that customer. Its value lives in the
// list's own filter conditions rather than beside them, so the Filter and
// QuickFilter controls and this switcher can never disagree.
import { Avatar, Badge, Button, Dropdown, FeatherIcon } from "frappe-ui";
import LucideBuilding2 from "~icons/lucide/building-2";
import { computed, h } from "vue";

type Organization = { name: string; customer_name?: string; image?: string };

const ALL_LABEL = "All organizations";

const props = withDefaults(
  defineProps<{
    organizations?: Organization[];
    /** Docname of the organization in play; empty means all of them. */
    activeOrganization?: string;
    onSelect?: (name: string) => void;
  }>(),
  { organizations: () => [], activeOrganization: "" }
);

const active = computed(() =>
  props.organizations.find(
    (organization) => organization.name === props.activeOrganization
  )
);

const activeLabel = computed(() =>
  active.value ? nameOf(active.value) : ALL_LABEL
);

const options = computed(() => [
  {
    label: ALL_LABEL,
    selected: !active.value,
    onClick: () => props.onSelect?.(""),
  },
  ...props.organizations.map((organization) => ({
    label: nameOf(organization),
    selected: organization.name === props.activeOrganization,
    slots: {
      prefix: () =>
        h(Avatar, {
          size: "sm",
          shape: "square",
          image: organization.image,
          label: nameOf(organization),
        }),
      suffix: () =>
        organization.name === props.activeOrganization
          ? h(Badge, { label: "Active", theme: "gray", variant: "subtle" })
          : null,
    },
    onClick: () => props.onSelect?.(organization.name),
  })),
]);

function nameOf(organization: Organization) {
  return organization.customer_name || organization.name;
}
</script>

<style>
/* Unscoped: the class lands on Button's own root, which carries no scope
   attribute of ours. Plain CSS because this app sits outside the bench's
   Tailwind content globs, so an arbitrary width class would not compile. */
.kb-org-switcher {
  width: 220px;
  justify-content: flex-start;
}

/* Button's label span, made to take the slack so the chevron sits at the far
   edge rather than trailing the name. */
.kb-org-switcher > span {
  flex: 1;
  text-align: left;
}
</style>
