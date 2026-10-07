export type CodemodePreference = "automatic" | "always";

export type CodemodeView = {
  /** Revision of the global settings.json, which holds these choices. */
  revision: string;
  preference: CodemodePreference;
  mode: "on" | "only";
  /** Undefined means Pi's default. */
  inlineBudget?: number;
  defaultInlineBudget: number;
  /** From mcp.json; Pi's default is true. */
  autoEnableCodemode: boolean;
  /** `-builtin:codemode` in the global extensions turns Code mode off entirely. */
  disabledByExtensions: boolean;
};
