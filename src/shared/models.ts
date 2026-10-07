/** A provider as the browser may see it: status only, never a credential value. */
export type ProviderView = {
  id: string;
  name: string;
  models: number;
  /** The provider accepts an API key. */
  apiKey: boolean;
  oauth?: { name: string; subscription: boolean };
  /** Pi's own status: whether requests would be authenticated, and from where. */
  auth: { configured: boolean; source?: string; label?: string };
  /** Credential type stored in auth.json, if any. */
  stored?: "api_key" | "oauth";
  /** Defined in models.json. */
  custom: boolean;
};

export type ProvidersView = { revision: string; providers: ProviderView[]; error?: string };

export type ModelSummary = { id: string; name: string; reasoning: boolean };
