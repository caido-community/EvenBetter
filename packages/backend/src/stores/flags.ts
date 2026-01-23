import { readFile, writeFile } from "fs/promises";
import * as path from "path";

import { type FeatureFlag, type FeatureFlagTag } from "shared";

import {
  backendHandleFlagToggle,
  initializeFeatures as initializeBackendFeatures,
} from "../features/manager";
import { type BackendSDK } from "../types";
import { exists, getFlagsPath } from "../utils/files";

interface StoredFlag {
  tag: FeatureFlagTag;
  enabled: boolean;
}

export class FeatureFlagsStore {
  private static instance: FeatureFlagsStore;
  private flags: FeatureFlag[];
  private sdk: BackendSDK;

  private constructor(sdk: BackendSDK) {
    this.sdk = sdk;
    this.flags = [
      // {
      //   tag: "backend-test",
      //   description: "Test backend flag",
      //   enabled: true,
      //   kind: "backend",
      // },
      {
        tag: "share-scope",
        description: "Share scope context menu button",
        enabled: true,
        kind: "frontend",
        requiresReload: false,
      },
      {
        tag: "quick-decode",
        description: "Decode & encode selection on the Replay page",
        enabled: true,
        kind: "frontend",
      },
      {
        tag: "clear-all-findings",
        description: "Adds a button to clear all findings",
        enabled: true,
        kind: "frontend",
      },
      {
        tag: "share-replay-collections",
        description: "Export & import replay collections",
        enabled: true,
        kind: "frontend",
      },

      {
        tag: "exclude-host-path",
        description:
          "Exclude Host/Path context menu buttons on the HTTP History page",
        enabled: true,
        kind: "frontend",
        requiresReload: true,
      },
      {
        tag: "quick-mar",
        description: "Quick Match and Replace context menu button",
        enabled: true,
        kind: "frontend",
        requiresReload: true,
      },
      {
        tag: "colorize-by-method",
        description:
          "Colorize session tabs by their HTTP methods in the Replay page",
        enabled: false,
        requiresReload: true,
        kind: "frontend",
        knownIssues: [
          "It's a bit unstable, so it's disabled by default. Working on a fix. If you want to try it, you can enable it by setting the flag to true.",
        ],
      },
      {
        tag: "share-filters",
        description: "Export & import filter presets",
        enabled: true,
        kind: "frontend",
      },
      {
        tag: "common-filters",
        description:
          "Creates and automatically updates common filters you may want to use. 1hr, recent, 24hr, 6hr, 12hr",
        enabled: true,
        kind: "frontend",
        requiresReload: false,
      },
      {
        tag: "command-palette-workflows",
        description: "Adds all your convert workflows to the command palette",
        enabled: true,
        kind: "frontend",
        requiresReload: true,
      },
    ];
  }

  static async initialize(sdk: BackendSDK): Promise<FeatureFlagsStore> {
    this.instance = new FeatureFlagsStore(sdk);
    await this.instance.readFlags();
    initializeBackendFeatures(this.instance.flags, sdk);
    return this.instance;
  }

  public async readFlags() {
    const flagsPath = getFlagsPath(this.sdk);
    const fileExists = await exists(flagsPath);

    if (!fileExists) {
      this.sdk.console.log("Flags file not found. Creating a new flags file.");
      const flagsPath = await this.saveFlagsToFile(this.flags);
      this.sdk.console.log("Flags file created at " + path.resolve(flagsPath));
    }

    try {
      const storedFlags: StoredFlag[] = JSON.parse(
        await readFile(flagsPath, "utf-8"),
      );
      storedFlags.forEach((storedFlag) => {
        const flag = this.flags.find((f) => f.tag === storedFlag.tag);
        if (flag) {
          flag.enabled = storedFlag.enabled;
        }
      });
    } catch (error) {
      this.sdk.console.error(
        "Unexpected error reading flags: " + String(error),
      );
    }
  }

  private async saveFlagsToFile(flags: FeatureFlag[]): Promise<string> {
    const flagsPath = getFlagsPath(this.sdk);
    const storedFlags: StoredFlag[] = flags.map((flag) => ({
      tag: flag.tag,
      enabled: flag.enabled,
    }));
    await writeFile(flagsPath, JSON.stringify(storedFlags, null, 2));
    return flagsPath;
  }

  static get(): FeatureFlagsStore {
    if (FeatureFlagsStore.instance === undefined) {
      throw new Error("FeatureFlagsStore not initialized");
    }

    return FeatureFlagsStore.instance;
  }

  getFlags(): FeatureFlag[] {
    return this.flags;
  }

  async setFlags(flags: FeatureFlag[]): Promise<void> {
    this.flags = flags;
    await this.saveFlagsToFile(flags);
  }

  async setFlag(tag: FeatureFlagTag, enabled: boolean): Promise<void> {
    const flag = this.flags.find((f) => f.tag === tag);
    if (flag) {
      flag.enabled = enabled;
      this.handleFlagToggle(flag, enabled);
    }
    await this.saveFlagsToFile(this.flags);
  }

  /**
   * If flag has kind of "frontend", it will be sent to the frontend via sdk.api.send(eventName, value)
   * If flag has kind of "backend", it will be handled by the backend
   */
  private handleFlagToggle(flag: FeatureFlag, enabled: boolean): void {
    switch (flag.kind) {
      case "frontend":
        this.sdk.api.send("flag:toggled", flag.tag, enabled);
        break;
      case "backend":
        backendHandleFlagToggle(flag.tag, enabled, this.sdk);
        break;
      default:
        this.sdk.console.warn(`Unknown flag kind: ${flag.kind}`);
    }
  }
}
