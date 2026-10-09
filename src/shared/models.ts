/** A provider as the browser may see it: status only, never a credential value. */
export type ProviderView = {
  id: string;
  name: string;
  models: number;
  /** The provider accepts an API key. */
  apiKey: boolean;
  /** Pi has its own key setup for it, which can ask for more than the key (account, region, profile). */
  keySetup: boolean;
  oauth?: { name: string; subscription: boolean };
  /** Pi's own status: whether requests would be authenticated, and from where. */
  auth: { configured: boolean; source?: string; label?: string };
  /** Credential type stored in auth.json, if any. */
  stored?: "api_key" | "oauth";
  /** Defined in models.json. */
  custom: boolean;
  /** Pi ships it; models.json may still change it. */
  builtIn: boolean;
  /** What Pi calls the credential its key setup asks for ("Anthropic API key", "AWS credentials or bearer token"). */
  keyName?: string;
  /** Where Pi sends requests. */
  baseUrl?: string;
  /** Models that do not chat, which scripts reach through codemode. */
  otherModels?: { image?: number; classifier?: number };
};

export type ProvidersView = { revision: string; providers: ProviderView[]; error?: string };

/** A chat model as Pi's catalog describes it. */
export type ModelSummary = {
  id: string; name: string; reasoning: boolean;
  contextWindow?: number; maxTokens?: number;
  /** Takes images as input. */
  image?: boolean;
  /** The levels Pi offers for it (getSupportedThinkingLevels); ["off"] when it does not think. */
  thinkingLevels: string[];
  /** US dollars per million tokens, when the catalog prices it. */
  cost?: { input: number; output: number };
};

/** A model of a provider that is set up here. */
export type AvailableModel = ModelSummary & { provider: string };

/** What `enabledModels` selects, matched as Pi matches it over the providers that are set up here. */
export type ModelScopeView = {
  /** reason says why a pattern selects nothing: its provider has no credential here, is not in the catalog, or no model matches. */
  patterns: { pattern: string; matches: number; models: string[]; reason?: "no-credential" | "unknown-provider" | "no-match" }[];
  /** New sessions start with this model when the default is not in the scope. */
  first?: string;
  /** Whether the default model is in the scope; absent when it is not in the catalog this app reads. */
  defaultInScope?: boolean;
};

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
