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
};

export type SkillsView = { revision: string; projectRevision?: string; skills: ResourceView[] };

export type PackageView = { source: string; installed: boolean; filtered: boolean };
export type PluginsView = { revision: string; projectRevision?: string; resources: ResourceView[]; packages: PackageView[] };
