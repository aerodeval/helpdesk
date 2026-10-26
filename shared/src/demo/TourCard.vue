<template>
  <div
    class="demo-tour-body flex flex-col gap-2 bg-surface-elevation-2 p-4 shadow-2xl"
  >
    <div class="flex items-start gap-2">
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <p v-if="progress" class="text-sm text-ink-gray-5">{{ progress }}</p>
        <h2
          id="driver-popover-title"
          class="text-lg font-semibold leading-snug text-ink-gray-9"
        >
          {{ step.title }}
        </h2>
      </div>
      <Button
        v-if="state.tour === 'running'"
        variant="ghost"
        class="-me-1.5 -mt-1 shrink-0"
        :aria-label="__('Close tour')"
        @click="card.dispatch({ type: 'DISMISS' })"
      >
        <LucideX class="size-4" />
      </Button>
    </div>
    <p id="driver-popover-description" class="text-p-base text-ink-gray-7">
      {{ step.body }}
    </p>

    <div class="flex flex-wrap items-center justify-end gap-2 pt-2">
      <template v-if="step.id === 'welcome' || step.id === 'intro_help'">
        <Button
          variant="ghost"
          :label="__('Explore on my own')"
          @click="card.dispatch({ type: 'DISMISS' })"
        />
        <Button
          variant="solid"
          :label="step.id === 'welcome' ? __('Start tour') : __('Next')"
          @click="
            card.dispatch({ type: step.id === 'welcome' ? 'START' : 'NEXT' })
          "
        />
      </template>
      <template v-else-if="step.id === 'end'">
        <Button
          variant="ghost"
          :label="__('Keep exploring')"
          @click="card.finish()"
        />
        <Button
          variant="subtle"
          :label="__('Talk to sales')"
          @click="card.finish(SALES_URL)"
        />
        <Button
          variant="solid"
          :label="__('Start free trial')"
          @click="card.finish(TRIAL_URL)"
        />
      </template>
      <template v-else>
        <Button
          v-if="waiting"
          variant="ghost"
          class="me-auto"
          :label="__('Skip this step')"
          @click="card.dispatch({ type: 'SKIP' })"
        />
        <Button
          v-if="canGoBack(state)"
          variant="ghost"
          :label="__('Back')"
          @click="card.dispatch({ type: 'BACK' })"
        />
        <Button
          v-if="card.hasShowMe"
          variant="subtle"
          :label="__('Show me')"
          :loading="card.showingMe"
          @click="card.showMe()"
        />
        <Button
          variant="solid"
          :label="
            step.id === 'intro_raise'
              ? __('See what Fernbill\'s team sees')
              : __('Next')
          "
          :disabled="waiting"
          @click="card.dispatch({ type: 'NEXT' })"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from "frappe-ui";
import { computed } from "vue";
import LucideX from "~icons/lucide/x";
import { __ } from "../translation";
import { SALES_URL, TRIAL_URL } from "./dock";
import { card } from "./tour";
import { canGoBack, isWaiting, STOP_LABELS, STOPS, stepAt } from "./tourScript";

const state = computed(() => card.state);
const step = computed(() => stepAt(state.value));
const waiting = computed(() => isWaiting(state.value));
const progress = computed(() => {
  const { stop } = step.value;
  return stop >= 1 && stop <= STOPS
    ? __("Step {0} of {1} · {2}", [stop, STOPS, STOP_LABELS[stop]])
    : "";
});
</script>

<style>
/* driver.js's own stylesheet is not loaded: these rules replace it */
.driver-popover.demo-tour-card {
  position: fixed;
  z-index: 1000000000;
  box-sizing: border-box;
  width: 384px;
  max-width: calc(100vw - 32px);
}

.demo-tour-card .demo-tour-body {
  border-radius: 12px;
}

.demo-tour-card .driver-popover-arrow {
  display: none;
}

/* The page stays usable: the dim never takes a click, and dialogs and menus a step opens sit above it */
.driver-overlay {
  z-index: 45 !important;
  pointer-events: none !important;
}

.driver-overlay path {
  opacity: 0.3 !important;
  pointer-events: none !important;
}

/* The card steps aside while the visitor works in a dialog, popover or menu the step opened */
body:has([data-dismissable-layer]) .demo-tour-card {
  visibility: hidden;
}

.driver-fade .demo-tour-card {
  animation: demo-tour-in 150ms ease-out;
}

@keyframes demo-tour-in {
  from {
    opacity: 0;
  }
}

/* A phone gets a sheet on the bottom edge, or the top edge when the anchor sits low */
@media (max-width: 639px) {
  .driver-popover.demo-tour-card {
    inset: auto 0 0 0 !important;
    width: 100%;
    max-width: none;
  }

  .driver-popover.demo-tour-card-top {
    inset: 0 0 auto 0 !important;
  }

  .demo-tour-card .demo-tour-body {
    border-radius: 12px 12px 0 0;
    padding-bottom: calc(1rem + env(safe-area-inset-bottom));
  }

  .demo-tour-card-top .demo-tour-body {
    border-radius: 0 0 12px 12px;
    padding-top: calc(1rem + env(safe-area-inset-top));
    padding-bottom: 1rem;
  }

  .demo-tour-card .demo-tour-body button {
    min-height: 44px;
  }
}
</style>
