<template>
  <FrappeUIProvider>
    <router-view />
  </FrappeUIProvider>
  <Dialogs />
  <DemoTour v-if="demoBoot()?.persona === 'agent'" />
</template>

<script setup lang="ts">
import { Dialogs } from "@/components/dialogs";
import { demoBoot, showRefreshNotice } from "@helpdesk/shared/demo";
import { useConfigStore } from "@/stores/config";
import { useFavicon } from "@vueuse/core";
import { FrappeUIProvider, setConfig, toast, useColorScheme } from "frappe-ui";
import { storeToRefs } from "pinia";
import { defineAsyncComponent, h, onMounted } from "vue";
import Wifi from "~icons/lucide/wifi";
import WifiOff from "~icons/lucide/wifi-off";
import { __ } from "./translation";

// loads driver.js and the tour only for a demo visitor
const DemoTour = defineAsyncComponent(() => import("@/demo/DemoTour.vue"));

const configStore = useConfigStore();
const { favicon } = storeToRefs(configStore);

useFavicon(favicon);

if (!localStorage.getItem("theme")) {
  localStorage.setItem("theme", "light");
}
useColorScheme();

onMounted(() => {
  window.addEventListener("online", () => {
    toast(__("You are now online."), {
      icon: () => h(Wifi, { class: "text-ink-base" }),
    });
  });

  window.addEventListener("offline", () => {
    toast(__("You are now offline."), {
      icon: () => h(WifiOff, { class: "text-ink-base" }),
    });
  });
  setConfig("localTimezone", window.timezone?.user);
  setConfig("systemTimezone", window.timezone?.system || null);
  showRefreshNotice();
});
</script>
