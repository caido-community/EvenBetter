import { Classic } from "@caido/primevue";
import { PiniaColada } from "@pinia/colada";
import { createPinia } from "pinia";
import PrimeVue from "primevue/config";
import Tooltip from "primevue/tooltip";
import { createApp } from "vue";

import "./features";
import { SDKPlugin } from "./plugins/sdk";
import "./styles/index.css";
import type { FrontendSDK } from "./types";
import App from "./views/App.vue";

import { initDOMManager } from "@/dom";
import { initialize } from "@/features/manager";
import { initFontLoader } from "@/fonts";

export const init = (sdk: FrontendSDK) => {
  initDOMManager();
  initialize(sdk);
  initFontLoader(sdk);

  const app = createApp(App);
  const pinia = createPinia();

  app.use(pinia);
  app.use(PiniaColada);

  app.use(PrimeVue, {
    unstyled: true,
    pt: Classic,
  });
  app.directive("tooltip", Tooltip);

  app.use(SDKPlugin, sdk);

  const root = document.createElement("div");
  Object.assign(root.style, {
    height: "100%",
    width: "100%",
  });

  root.id = `plugin--evenbetter`;

  app.mount(root);

  sdk.navigation.addPage("/evenbetter", {
    body: root,
  });

  sdk.sidebar.registerItem("EvenBetter", "/evenbetter", {
    icon: "fas fa-rocket",
  });
};
