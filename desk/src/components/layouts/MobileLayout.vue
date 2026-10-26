<template>
  <div class="relative flex h-screen w-screen">
    <MobileSidebar />
    <div class="flex h-full flex-col flex-1 overflow-auto">
      <MobileAppHeader />
      <slot />
    </div>
    <DemoDock v-if="isDemo()" />
  </div>
</template>
<script setup>
import { isDemo } from "@helpdesk/shared/demo";
import DemoDock from "@helpdesk/shared/demo/DemoDock.vue";
import MobileSidebar from "./MobileSidebar.vue";
import MobileAppHeader from "./MobileAppHeader.vue";
</script>
