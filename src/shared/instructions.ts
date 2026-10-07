export type InstructionId = "global:context" | "global:system" | "global:append" | "project:context" | "project:system" | "project:append";

export type InstructionFile = {
  id: InstructionId;
  scope: "global" | "project";
  kind: "context" | "system" | "append";
  path: string;
  exists: boolean;
  revision: string;
  text?: string;
  /** Why the app cannot read or edit it (for example a symbolic link). */
  error?: string;
  /** Other context candidates in the same folder, which Pi skips because this one comes first. */
  others?: string[];
};

/** Context files Pi loads for the chosen project, in order (global, then ancestors to the project). */
export type InstructionsView = { files: InstructionFile[]; loaded: string[] };
