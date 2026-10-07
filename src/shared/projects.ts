export type TrustView = {
  defaultTrust: "ask" | "always" | "never";
  /** The closest saved decision, from Pi's trust.json. */
  decision?: boolean;
  savedFor?: string;
  /** T3Code runs Pi without a trust prompt: only a saved yes or defaultProjectTrust "always" loads .pi. */
  loadsInT3Code: boolean;
};

export type ProjectView = { path: string; lastActive?: string; trust: TrustView };
