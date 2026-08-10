<template>
  <div v-if="organizations.length" class="kb-org-avatars">
    <span v-for="org in visible" :key="org.name" class="kb-org-avatars__item">
      <Tooltip :text="org.customer_name">
        <Avatar
          class="kb-org-avatars__avatar"
          shape="circle"
          :size="size"
          :image="org.image"
          :label="org.customer_name"
        />
      </Tooltip>
    </span>
    <span v-if="hidden.length" class="kb-org-avatars__item">
      <Tooltip :text="hiddenNames">
        <div class="kb-org-avatars__avatar kb-org-avatars__overflow">
          +{{ hidden.length }}
        </div>
      </Tooltip>
    </span>
  </div>
</template>

<script setup lang="ts">
// The agent portal's MultipleAvatar in the same shape: overlapped circles, a name
// on hover, the tail collapsed into "+n". Spreading the stack on hover needs a
// :hover rule, which a block's inline styles can't express — hence a component.
import { Avatar, Tooltip } from "frappe-ui";
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    organizations?: { name: string; customer_name: string; image?: string }[];
    /** Past this many, the rest collapse into the "+n" chip. */
    max?: number;
    size?: string;
  }>(),
  { organizations: () => [], max: 3, size: "md" }
);

const visible = computed(() => props.organizations.slice(0, props.max));
const hidden = computed(() => props.organizations.slice(props.max));
const hiddenNames = computed(() =>
  hidden.value.map((org) => org.customer_name).join(", ")
);
</script>

<style scoped>
/* Plain CSS: this app is outside the bench's Tailwind content globs, so the
   arbitrary ring/hover utilities helpdesk uses never compile here. */
.kb-org-avatars {
  display: flex;
  align-items: center;
}

.kb-org-avatars__item + .kb-org-avatars__item {
  margin-left: -6px;
  transition: margin-left 150ms ease;
}

/* Open the stack up so every organization is legible before it is hovered. */
.kb-org-avatars:hover .kb-org-avatars__item + .kb-org-avatars__item {
  margin-left: 4px;
}

.kb-org-avatars__item {
  display: flex;
}

.kb-org-avatars__avatar {
  box-shadow: 0 0 0 2px var(--surface-base);
  transition: transform 150ms ease;
}

.kb-org-avatars__item:hover .kb-org-avatars__avatar {
  transform: scale(1.1);
}

.kb-org-avatars__overflow {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px; /* frappe-ui Avatar md */
  height: 24px;
  border-radius: 9999px;
  background: var(--surface-gray-3);
  color: var(--ink-gray-7);
  font-size: 12px;
}
</style>
