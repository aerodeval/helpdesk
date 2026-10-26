<template>
  <!-- The Try-it Checklist; the dock's "Things to try" opens it. HelpModal is fixed with no
  top, so this box gives it the top edge the sidebar gives the stock one. -->
  <div class="fixed top-0">
    <HelpModal
      v-if="showHelpModal"
      v-model="showHelpModal"
      :articles="[]"
      :appName="CHECKLIST"
      title="Frappe Helpdesk"
      :logo="logo"
      docsLink="https://docs.frappe.io/helpdesk"
    />
  </div>
</template>

<script setup lang="ts">
import HDLogo from "@/assets/logos/HDLogo.vue";
import { HelpModal, showHelpModal } from "@framework/ui";
import { CHECKLIST } from "@helpdesk/shared/demo";
import { h, onMounted } from "vue";
import { startDeskTour } from "./tour";

const logo = h(HDLogo, { class: "h-12 w-12" });

onMounted(startDeskTour);
</script>
