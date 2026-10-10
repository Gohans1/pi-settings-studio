import { estimateTokens } from "@earendil-works/pi-coding-agent";
import type { SystemMessage, Tool } from "@earendil-works/pi-ai";
import type { PromptPart } from "../shared/sessions.ts";

/** Pi's own estimate of a system message (its compaction's): about four characters a token. */
export const tokensOf = (message: Partial<Pick<SystemMessage, "content" | "sections" | "toolsAdded">>) =>
  estimateTokens({ role: "system", content: "", timestamp: 0, ...message } as Parameters<typeof estimateTokens>[0]);

export const sectionPart = (name: string, text: string): PromptPart => ({ name, text, tokens: tokensOf({ sections: { [name]: text } }) });

/** A tool as the model reads it: its name, description and parameters, without what only Pi uses. */
export function declarationPart({ name, description, parameters }: Pick<Tool, "name" | "description" | "parameters">): PromptPart {
  const declaration = { name, description, parameters };
  return { name, text: JSON.stringify(declaration, null, 2), tokens: tokensOf({ toolsAdded: [declaration] }) };
}
