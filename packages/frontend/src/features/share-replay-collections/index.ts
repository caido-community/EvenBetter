import { type RequestRawInput } from "@caido/sdk-frontend/src/types/__generated__/graphql-sdk";

import { onLocationChange } from "@/dom";
import { createFeature } from "@/features/manager";
import { type FrontendSDK } from "@/types";
import { downloadFile, importFile } from "@/utils/file-utils";

const shareReplayCollectionsElements: HTMLElement[] = [];
let mutationObserver: MutationObserver | undefined = undefined;
const cancelFunctions: (() => void)[] = [];

type DownloadCollectionResult =
  | { kind: "Ok" }
  | { kind: "Error"; error: string };

type ImportedReplayEntry = {
  name: string;
  raw: string;
  connection: {
    host: string;
    port: number;
    isTLS: boolean;
  };
};

type ImportedCollection = {
  name: string;
  replayEntries?: ImportedReplayEntry[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isImportedReplayEntry(value: unknown): value is ImportedReplayEntry {
  if (!isRecord(value)) return false;
  if (!isRecord(value.connection)) return false;

  return (
    typeof value.name === "string" &&
    typeof value.raw === "string" &&
    typeof value.connection.host === "string" &&
    typeof value.connection.port === "number" &&
    typeof value.connection.isTLS === "boolean"
  );
}

function isImportedCollection(value: unknown): value is ImportedCollection {
  if (!isRecord(value)) return false;
  if (typeof value.name !== "string") return false;
  if (value.replayEntries === undefined) return true;
  if (!Array.isArray(value.replayEntries)) return false;

  return value.replayEntries.every(isImportedReplayEntry);
}

export const shareReplayCollections = createFeature(
  "share-replay-collections",
  {
    onFlagEnabled: (sdk: FrontendSDK) => {
      collectionsShare(sdk);
    },
    onFlagDisabled: (sdk: FrontendSDK) => {
      shareReplayCollectionsElements.forEach((element) => {
        element.remove();
      });
      shareReplayCollectionsElements.length = 0;

      cancelFunctions.forEach((cancelFunction) => cancelFunction());
      cancelFunctions.length = 0;

      if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = undefined;
      }
    },
  },
);

const collectionsShare = (sdk: FrontendSDK) => {
  const { stop: stopProjectChange } = sdk.backend.onEvent(
    "caido:project-change",
    () => {
      if (window.location.hash === "#/replay") {
        attachImportButton(sdk);
        attachExportButton(sdk);
      }
    },
  );

  const stopPageOpen = onLocationChange((data) => {
    if (data.newHash === "#/replay") {
      attachImportButton(sdk);
      attachExportButton(sdk);

      if (mutationObserver) mutationObserver.disconnect();

      mutationObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.addedNodes.length > 0) {
            attachExportButton(sdk);
          }
        });
      });

      const tree = document.querySelector(".c-session-list-body__tree .c-tree");
      if (!tree) return;

      mutationObserver.observe(tree, {
        childList: true,
        subtree: true,
      });
    }
  });

  cancelFunctions.push(stopProjectChange, stopPageOpen);
};

const getCollectionByID = async (collectionID: string, sdk: FrontendSDK) => {
  return await sdk.graphql.replaySessionCollections().then((data) => {
    const collections = data.replaySessionCollections.edges;

    return collections.find(
      (collection) => collection.node.id === collectionID,
    );
  });
};

const createSession = async (
  collectionID: string,
  request: RequestRawInput,
  sdk: FrontendSDK,
) => {
  return await sdk.graphql.createReplaySession({
    input: {
      collectionId: collectionID,
      requestSource: {
        raw: request,
      },
    },
  });
};

const createCollection = async (collectionName: string, sdk: FrontendSDK) => {
  return await sdk.graphql.createReplaySessionCollection({
    input: {
      name: collectionName,
    },
  });
};

const downloadCollection = async (
  collectionID: string,
  sdk: FrontendSDK,
): Promise<DownloadCollectionResult> => {
  const collection = await getCollectionByID(collectionID, sdk);
  if (!collection) return { kind: "Error", error: "Collection not found" };

  const replayEntries = [];

  const sessions = collection.node.sessions;
  if (sessions.length > 0) {
    for (const session of sessions) {
      const entryID = session.activeEntry?.id;
      if (entryID === undefined) continue;

      const replayEntry = await sdk.graphql.replayEntry({
        id: entryID,
      });

      replayEntries.push({ ...replayEntry.replayEntry, name: session.name });
    }
  }

  const collectionExport = {
    name: collection.node.name,
    replayEntries: replayEntries,
  };

  const collectionName = collection.node.name.replaceAll(" ", "_");

  downloadFile(
    "collection_" + collectionName + ".json",
    JSON.stringify(collectionExport),
  );

  sdk.window.showToast("Collection downloaded successfully!", {
    duration: 3000,
    variant: "success",
  });

  return { kind: "Ok" };
};

const importCollection = async (collection: unknown, sdk: FrontendSDK) => {
  if (!isImportedCollection(collection)) {
    sdk.window.showToast("Invalid collection file", {
      duration: 3000,
      variant: "error",
    });
    return;
  }

  const collectionName = collection.name;
  const newCollection = await createCollection(collectionName, sdk);

  const newCollectionID =
    newCollection.createReplaySessionCollection.collection?.id;
  if (newCollectionID === undefined) return;

  const replayEntries = collection.replayEntries;
  if (replayEntries && replayEntries.length > 0) {
    for (const replayEntry of replayEntries) {
      const requestRawInput: RequestRawInput = {
        connectionInfo: {
          host: replayEntry.connection.host,
          port: replayEntry.connection.port,
          isTLS: replayEntry.connection.isTLS,
        },
        raw: replayEntry.raw,
      };

      const newSession = await createSession(
        newCollectionID,
        requestRawInput,
        sdk,
      );

      const sessionID = newSession.createReplaySession.session?.id;
      if (sessionID === undefined) continue;

      await sdk.graphql.renameReplaySession({
        id: sessionID,
        name: replayEntry.name,
      });
    }
  }

  sdk.window.showToast("Collection imported successfully!", {
    duration: 3000,
    variant: "success",
  });

  return newCollectionID;
};

const attachImportButton = (sdk: FrontendSDK) => {
  if (document.querySelector("#import-collection")) return;

  const topbarLeft = document.querySelector(".c-topbar__left");
  if (!topbarLeft) return;

  const importButton = sdk.ui.button({
    label: "Import Collection",
    variant: "tertiary",
    size: "small",
    leadingIcon: "fas fa-file-import",
  });
  shareReplayCollectionsElements.push(importButton);

  importButton.id = "import-collection";

  importButton.style.float = "left";
  importButton.style.marginRight = "1em";
  importButton.addEventListener("click", () => {
    importFile(".json", async (content: string) => {
      try {
        const collection = JSON.parse(content);
        await importCollection(collection, sdk);
      } catch (error) {
        console.error("Failed to import collection:", error);
        sdk.window.showToast("Failed to import collection", {
          duration: 3000,
          variant: "error",
        });
      }
    });
  });

  topbarLeft.prepend(importButton);
};

const attachExportButton = (sdk: FrontendSDK) => {
  const collections = document.querySelectorAll(".c-tree-collection");
  if (collections.length === 0) return;

  collections.forEach((collection) => {
    if (collection.querySelector("#download-collection")) return;

    const actions = collection.querySelector(".c-tree-collection__actions");
    if (!actions) return;

    const newElement = actions.childNodes[0]?.cloneNode(true);
    if (!(newElement instanceof HTMLElement)) return;

    shareReplayCollectionsElements.push(newElement);

    const icon = newElement.querySelector("i");
    if (!icon) return;

    newElement.id = "download-collection";
    icon.classList.value = "c-icon fas fa-file-arrow-down";
    newElement.addEventListener("click", async () => {
      const collectionID = collection.getAttribute("data-collection-id");
      if (collectionID === null) return;

      const result = await downloadCollection(collectionID, sdk);
      if (result.kind === "Error") {
        sdk.window.showToast("Failed to download collection: " + result.error, {
          duration: 3000,
          variant: "error",
        });
      }
    });

    actions.prepend(newElement);
  });
};
