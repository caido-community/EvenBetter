import "./style.css";

import { onLocationChange } from "@/dom";
import { createFeature } from "@/features/manager";
import { type FrontendSDK } from "@/types";

let abortController: AbortController | undefined = undefined;
let observer: MutationObserver | undefined = undefined;
let stopLocationChange: (() => void) | undefined = undefined;
let stopProjectChange: (() => void) | undefined = undefined;

async function setTabMethodAttributes(sdk: FrontendSDK) {
  const tabs = document.querySelectorAll(
    ".c-tab-list__body .c-tab-list__tab [data-session-id]",
  );

  for (const tab of Array.from(tabs)) {
    const sessionId = tab.getAttribute("data-session-id");
    if (sessionId === null) continue;

    const method = await getHTTPMethod(sessionId, sdk);
    tab.setAttribute("http-method", method);
  }

  setTimeout(() => {
    updateSelectedTabColor();
  }, 100);
}

function updateCurrentTabHTTPMethod(newMethod: string) {
  const element = document.querySelector(
    ".c-tab-list__tab [data-is-selected=true][data-session-id]",
  );
  if (!element) return;

  element.setAttribute("http-method", newMethod);
}

function updateSelectedTabColor() {
  const httpMethod = document.querySelector(
    ".c-lang-http-request__method",
  )?.textContent;
  if (httpMethod === null || httpMethod === undefined) return;

  updateCurrentTabHTTPMethod(httpMethod);
}

function liveUpdateHTTPMethod() {
  const controller = new AbortController();
  document.addEventListener(
    "keyup",
    () => {
      if (location.hash !== "#/replay") return;
      updateSelectedTabColor();
    },
    { signal: controller.signal },
  );
  return controller;
}

type HTTPMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "OPTIONS"
  | "PATCH"
  | "HEAD"
  | "TRACE"
  | "CONNECT"
  | "UNKNOWN";

const HTTP_METHODS = new Set<string>([
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "OPTIONS",
  "PATCH",
  "HEAD",
  "TRACE",
  "CONNECT",
]);

function isHTTPMethod(method: string | undefined): method is HTTPMethod {
  return method !== undefined && HTTP_METHODS.has(method);
}

async function getHTTPMethod(
  sessionId: string,
  sdk: FrontendSDK,
): Promise<HTTPMethod> {
  const data = await sdk.graphql.replayEntry({ id: sessionId });
  if (data.replayEntry?.raw === undefined) return "UNKNOWN";

  const method = data.replayEntry.raw.split("\n")[0]?.split(" ")[0];
  if (isHTTPMethod(method)) return method;

  return "UNKNOWN";
}

function handleTabListChanges(sdk: FrontendSDK) {
  void setTabMethodAttributes(sdk);

  const observer = new MutationObserver(() => {
    void setTabMethodAttributes(sdk);
  });

  const tabList = document.querySelector(".c-tab-list__body");
  if (tabList) {
    observer.observe(tabList, {
      childList: true,
    });
  }

  return observer;
}

const cleanup = () => {
  if (observer) {
    observer.disconnect();
    observer = undefined;
  }

  if (abortController) {
    abortController.abort();
    abortController = undefined;
  }
};

const cleanupListeners = () => {
  if (stopLocationChange !== undefined) {
    stopLocationChange();
    stopLocationChange = undefined;
  }

  if (stopProjectChange !== undefined) {
    stopProjectChange();
    stopProjectChange = undefined;
  }
};

function setup(sdk: FrontendSDK) {
  cleanup();

  if (window.location.hash === "#/replay") {
    observer = handleTabListChanges(sdk);
  }
}

export const colorizeByMethod = createFeature("colorize-by-method", {
  onFlagEnabled: (sdk) => {
    cleanupListeners();
    setup(sdk);

    setTimeout(() => {
      abortController = liveUpdateHTTPMethod();
    }, 2000);

    stopLocationChange = onLocationChange((data) => {
      cleanup();

      if (data.newHash === "#/replay") {
        observer = handleTabListChanges(sdk);
      }
    });

    const projectChange = sdk.backend.onEvent("caido:project-change", () => {
      let attempts = 0;
      const maxAttempts = 25;
      const interval = setInterval(() => {
        const tabList = document.querySelector(".c-tab-list__body");
        if (tabList) {
          setup(sdk);
          clearInterval(interval);
        }
        attempts++;
        if (attempts >= maxAttempts) {
          clearInterval(interval);
        }
      }, 200);
    });
    stopProjectChange = projectChange.stop;
  },
  onFlagDisabled: () => {
    cleanup();
    cleanupListeners();
  },
});
