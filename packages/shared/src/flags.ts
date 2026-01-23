export type FeatureFlagTag =
  | "exclude-host-path"
  | "backend-test"
  | "quick-decode"
  | "clear-all-findings"
  | "share-scope"
  | "share-replay-collections"
  | "colorize-by-method"
  | "share-filters"
  | "quick-mar"
  | "common-filters"
  | "command-palette-workflows";

export type FeatureFlagKind = "backend" | "frontend";

export type FeatureFlag = {
  tag: FeatureFlagTag;
  description: string;
  enabled: boolean;
  kind: FeatureFlagKind;
  knownIssues?: string[];
  requiresReload?: boolean;
};
