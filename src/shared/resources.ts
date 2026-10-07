export type ResourceView = {
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

export type SkillsView = { revision: string; skills: ResourceView[] };
