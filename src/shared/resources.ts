export type ResourceType = "extensions" | "skills" | "prompts" | "themes";

export type ResourceView = {
  type: ResourceType;
  /** Identifies the resource in requests; the server re-resolves it and never uses it as a path to open. */
  path: string;
  name: string;
  description?: string;
  enabled: boolean;
  origin: "top-level" | "package";
  scope: string;
  /** Group label as `pi config` shows it. */
  group: string;
  disableModelInvocation?: boolean;
  /** Pi skips this skill: another one of the same name comes first. The value is that one's path. */
  shadowedBy?: string;
};

export type SkillsView = { revision: string; projectRevision?: string; skills: ResourceView[] };

export type PackageFilters = { autoload?: boolean; extensions?: string[]; skills?: string[]; prompts?: string[]; themes?: string[] };
export type PackageView = { scope: "global" | "project"; source: string; installed: boolean; filtered: boolean; filters: PackageFilters };
/** Pi reports positive matches only; an empty result does not prove every source was reachable. */
export type PackageUpdateCheck = {
  revision: string; projectRevision?: string; checkedAt: string; offline: boolean;
  updates: { source: string; scope: "global" | "project" }[];
};
export type PluginsView = { revision: string; projectRevision?: string; resources: ResourceView[]; packages: PackageView[]; updateCheck?: PackageUpdateCheck };

/** One file of a resource. `files` lists a skill's folder (relative paths); other resources have one. */
export type ResourceFileView = { path: string; file: string; text: string; revision: string; editable: boolean; readOnly?: string; files: string[] };

/** A path entry of the `skills`, `extensions`, `prompts` or `themes` setting: a folder or file Pi also loads from. */
export type ResourcePathView = {
  scope: "global" | "project"; entry: string; resolved: string; exists: boolean; kind?: "folder" | "file"; found: number;
  /** Skills only: found skills that replace one of the same name elsewhere, and found skills Pi skips for one. */
  replaces?: number; skipped?: number;
};
export type ResourcePathsView = {
  type: ResourceType; revision: string; projectRevision?: string; paths: ResourcePathView[];
  /** Where Pi looks without any setting. */
  standard: { scope: "global" | "project"; path: string; exists: boolean }[];
};
