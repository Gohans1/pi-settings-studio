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

/** The model fields the custom-provider form edits; other keys of a model are kept. */
export type CustomModel = { id: string; name?: string; reasoning?: boolean; image?: boolean; contextWindow?: number; maxTokens?: number };

export type CustomProviderView = {
  id: string;
  name?: string;
  baseUrl?: string;
  api?: string;
  /** How the API key is given; the value itself never leaves the server. */
  apiKey?: "literal" | "environment" | "command";
  headers: string[];
  authHeader?: boolean;
  models: CustomModel[];
  /** Keys the form does not edit (compat, modelOverrides…), kept as they are. */
  otherKeys: string[];
};

export type CustomProvidersView = { path: string; revision: string; exists: boolean; hasBackup: boolean; error?: string; providers: CustomProviderView[] };

export type CustomProviderInput = {
  name?: string; baseUrl?: string; api?: string;
  /** A new key; empty keeps the stored one unless clearApiKey is set. */
  apiKey?: string; clearApiKey?: boolean;
  headers?: { name: string; value?: string }[];
  authHeader?: boolean;
  models: CustomModel[];
};
