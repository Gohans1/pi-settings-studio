export type TrustView = {
  defaultTrust: "ask" | "always" | "never";
  /** The closest saved decision, from Pi's trust.json. */
  decision?: boolean;
  savedFor?: string;
  /** Pi without a trust prompt loads .pi only with a saved yes or defaultProjectTrust "always". */
  loadsWithoutPrompt: boolean;
};

export type ProjectView = { path: string; lastActive?: string; trust: TrustView };
