export type CodemodePreference = "automatic" | "always";
/** In a project, "inherit" leaves the choice to the global settings. */
export type ProjectCodemodePreference = CodemodePreference | "inherit";

export type CodemodeView = {
  scope: "global" | "project";
  /** Revision of the settings.json that holds these choices. */
  revision: string;
  preference: ProjectCodemodePreference;
  mode: "on" | "only";
  /** Project only: a mode set in the project file (else inherited). */
  ownMode?: "on" | "only";
  /** Undefined means inherited (project) or Pi's default (global). */
  inlineBudget?: number;
  defaultInlineBudget: number;
  /** From mcp.json; Pi's default is true. */
  autoEnableCodemode: boolean;
  /** Project only: autoEnableCodemode set in the project's mcp.json. */
  ownAutoEnable?: boolean;
  /** `-builtin:codemode` turns Code mode off entirely. */
  disabledByExtensions: boolean;
  /** Project only: what the project's sessions get after the global settings. */
  effective?: { preference: CodemodePreference; mode: "on" | "only"; inlineBudget: number; autoEnableCodemode: boolean };
};
