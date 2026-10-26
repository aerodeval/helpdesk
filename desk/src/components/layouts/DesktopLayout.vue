<template>
  <div class="flex h-screen w-screen">
    <Sidebar />
    <!-- Holds the demo dock in the content area's corners, clear of the sidebar -->
    <div class="relative flex min-w-0 flex-1">
      <div class="flex-1 flex flex-col h-full overflow-auto relative">
        <AppHeader />
        <slot />
      </div>
      <DemoDock v-if="isDemo()" />
    </div>
    <Notifications />
  </div>
</template>
<script setup>
import { Notifications } from "@/components";
import { isDemo } from "@helpdesk/shared/demo";
import DemoDock from "@helpdesk/shared/demo/DemoDock.vue";
import AppHeader from "./AppHeader.vue";
import Sidebar from "./Sidebar.vue";
</script>
