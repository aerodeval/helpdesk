<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div
      v-if="loading && !rows.length"
      class="flex h-full w-full items-center justify-center"
    >
      <LoadingIndicator :scale="8" />
    </div>

    <ListView
      v-else-if="rows.length"
      class="min-h-0 flex-1"
      :columns="columns"
      :rows="rows"
      row-key="name"
      :options="{
        selectable: true,
        showTooltip: false,
        resizeColumn: true,
        onRowClick,
      }"
    >
      <ListHeader class="mx-3 sm:mx-5">
        <ListHeaderItem
          v-for="column in columns"
          :key="column.key"
          :item="column"
          @columnWidthUpdated="(payload) => emit('columnResize', payload)"
        />
      </ListHeader>
      <ListRows class="mx-3 sm:mx-5">
        <ListRow
          v-for="row in rows"
          :key="row.name"
          :row="row"
          v-slot="{ column, item }"
          class="truncate text-base row"
        >
          <ListRowItem :item="item" :column="column" :row="row">
            <component
              :is="column.cell({ row, item })"
              v-if="column.cell"
              :key="column.key"
            />
          </ListRowItem>
        </ListRow>
      </ListRows>
      <ListSelectBanner />
    </ListView>

    <!-- Mirrors the agent list's EmptyState: icon over a medium title over a
         smaller description, centred and non-interactive. -->
    <div
      v-else
      class="pointer-events-none flex h-full items-center justify-center"
    >
      <div class="flex flex-col items-center gap-2 text-ink-gray-4">
        <FeatherIcon name="inbox" class="h-10 w-10" />
        <div class="flex flex-col items-center justify-center gap-0.5">
          <span class="text-base font-medium text-ink-gray-8">
            {{ emptyState.title }}
          </span>
          <span
            v-if="emptyState.description"
            class="mt-1 text-center text-p-sm text-ink-gray-6"
          >
            {{ emptyState.description }}
          </span>
        </div>
      </div>
    </div>

    <div v-if="rows.length" class="border-t px-3 py-2 sm:px-5">
      <ListFooter
        v-model="pageLength"
        :options="{ rowCount, totalCount, pageLengthOptions }"
        @loadMore="emit('loadMore')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
// The KB portal's ticket table. Deliberately a mirror of the agent portal's
// `desk/src/components/ListViewBuilder.vue` — same frappe-ui primitives, same
// gutters (`mx-5`), same footer chrome — so both list views read as one design.
// It draws nothing itself: every cell comes from its column's `cell()`, the way
// ListViewBuilder defers to `listCell`.
import {
  FeatherIcon,
  ListFooter,
  ListHeader,
  ListHeaderItem,
  ListRow,
  ListRowItem,
  ListRows,
  ListSelectBanner,
  ListView,
  LoadingIndicator,
} from "frappe-ui";

withDefaults(
  defineProps<{
    columns?: any[];
    rows?: any[];
    loading?: boolean;
    rowCount?: number;
    totalCount?: number;
    pageLengthOptions?: number[];
    emptyState?: { title: string; description?: string };
    onRowClick?: (row: any) => void;
  }>(),
  {
    columns: () => [],
    rows: () => [],
    loading: false,
    rowCount: 0,
    totalCount: 0,
    pageLengthOptions: () => [20, 50, 100],
    emptyState: () => ({ title: "No tickets found" }),
  }
);

const pageLength = defineModel<number>("pageLength", { default: 20 });

const emit = defineEmits<{
  (
    e: "columnResize",
    payload: { key: string; width: string; save: boolean }
  ): void;
  (e: "loadMore"): void;
}>();
</script>
