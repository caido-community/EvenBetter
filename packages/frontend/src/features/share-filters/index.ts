import { onLocationChange } from "@/dom";
import { createFeature } from "@/features/manager";
import { type FrontendSDK } from "@/types";
import { downloadFile, importFile } from "@/utils/file-utils";

let filterTabObserver: MutationObserver | undefined = undefined;
let cancelListener: (() => void) | undefined = undefined;
let filterButtons: HTMLElement[] = [];

export const shareFilters = createFeature("share-filters", {
  onFlagEnabled: (sdk: FrontendSDK) => {
    cancelListener = onLocationChange((data) => {
      cleanupFilterElements();

      if (data.newHash === "#/filter") {
        addImportButton(sdk);
        observeFilterTab(sdk);
      }
    });
  },
  onFlagDisabled: () => {
    cleanupFilterElements();
    if (cancelListener !== undefined) {
      cancelListener();
      cancelListener = undefined;
    }
  },
});

const cleanupFilterElements = () => {
  if (filterTabObserver) {
    filterTabObserver.disconnect();
    filterTabObserver = undefined;
  }

  filterButtons.forEach((b) => b.remove());
  filterButtons = [];
};

const addImportButton = (sdk: FrontendSDK) => {
  const topbarLeft = document.querySelector(
    ".c-topbar .c-topbar__left",
  ) as HTMLElement;
  if (topbarLeft === null || document.querySelector("#filter-presets-import"))
    return;

  const importButton = sdk.ui.button({
    label: "Import",
    leadingIcon: "fas fa-file-upload",
    variant: "tertiary",
    size: "small",
  });
  importButton.id = "filter-presets-import";
  importButton.addEventListener("click", () => {
    importFile(".json", (content: string) => {
      try {
        const data = JSON.parse(content);

        sdk.graphql
          .createFilterPreset({
            input: {
              alias: data.alias,
              clause: data.clause,
              name: data.name,
            },
          })
          .then(() => {
            sdk.window.showToast("Filter preset imported successfully", {
              duration: 3000,
              variant: "success",
            });
          })
          .catch((error) => {
            sdk.window.showToast(
              `Failed to import filter preset: ${error.message}`,
              {
                duration: 3000,
                variant: "error",
              },
            );
          });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        sdk.window.showToast(
          `Failed to import filter preset: ${errorMessage}`,
          {
            duration: 3000,
            variant: "error",
          },
        );
      }
    });
  });

  filterButtons.push(importButton);

  topbarLeft.appendChild(importButton);
};

const observeFilterTab = (sdk: FrontendSDK) => {
  const formBody = document.querySelector(".c-form-body__actions");
  if (formBody !== null) {
    attachDownloadButton(sdk);
  }

  const filterContainer = document.querySelector(".c-filter");

  if (filterTabObserver) {
    filterTabObserver.disconnect();
    filterTabObserver = undefined;
  }

  filterTabObserver = new MutationObserver((mutations) => {
    if (mutations.every((m) => m.attributeName === "style")) return;

    if (!document.querySelector("#filter-presets-download")) {
      attachDownloadButton(sdk);
    }
  });

  if (formBody !== null) {
    filterTabObserver.observe(formBody, {
      childList: true,
      attributes: true,
      subtree: true,
    });
  }

  if (filterContainer !== null) {
    filterTabObserver.observe(filterContainer, {
      childList: true,
      attributes: true,
      subtree: true,
    });
  }
};

const attachDownloadButton = (sdk: FrontendSDK) => {
  if (document.querySelector("#filter-presets-download")) return;

  const formActions = document.querySelector(".c-form-body__actions");
  if (!formActions) return;

  const downloadButton = sdk.ui.button({
    label: "Download",
    leadingIcon: "fas fa-file-arrow-down",
    variant: "tertiary",
    size: "small",
  });
  filterButtons.push(downloadButton);

  downloadButton.id = "filter-presets-download";

  const button = downloadButton.querySelector("button");
  if (!button) return;

  button.addEventListener("click", () => {
    const id = getActiveFilterPreset();
    if (id === null || id === undefined) {
      sdk.window.showToast("No filter preset selected", {
        duration: 3000,
        variant: "error",
      });
      return;
    }

    sdk.graphql
      .filterPresets()
      .then((response) => {
        const presets = response.filterPresets;
        const preset = presets.find((p) => p.id === id);

        if (preset === undefined) {
          sdk.window.showToast("Filter preset not found", {
            duration: 3000,
            variant: "error",
          });
          return;
        }

        const presetData = {
          id: preset.id,
          alias: preset.alias,
          name: preset.name,
          clause: preset.clause,
        };

        downloadFile(`filter-${preset.alias}.json`, JSON.stringify(presetData));
        sdk.window.showToast("Filter preset downloaded successfully", {
          duration: 3000,
          variant: "success",
        });
      })
      .catch((error) => {
        sdk.window.showToast(
          `Failed to download filter preset: ${error.message}`,
          {
            duration: 3000,
            variant: "error",
          },
        );
      });
  });

  formActions.appendChild(downloadButton);
};

const getActiveFilterPreset = () => {
  return document
    .querySelector(`.c-preset[data-is-selected="true"]`)
    ?.getAttribute("data-preset-id");
};
