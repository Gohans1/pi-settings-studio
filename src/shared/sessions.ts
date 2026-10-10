export type SessionSummary = {
  id: string;
  cwd: string;
  /** The session name, else the start of the first message. */
  title: string;
  modified: string;
  messageCount: number;
};

/** A prompt section or a tool declaration, with Pi's estimate of its tokens. */
export type PromptPart = { name: string; text: string; tokens: number };

/** A later system message: sections it replaced (null: removed) and tools it added or removed. */
export type PromptChange = {
  at: number;
  /** Instructions added from this point on. */
  content?: string;
  sections: { name: string; text: string | null }[];
  added: PromptPart[];
  removed: string[];
};

export type SystemPromptView = {
  id: string;
  cwd: string;
  /** What Pi recorded for the first request: the prompt and every tool declaration. */
  start?: { at: number; content?: PromptPart; sections: PromptPart[]; declarations: PromptPart[]; tokens: number };
  changes: PromptChange[];
  /** The prompt after every change, as Pi renders it: content, then the sections. */
  text: string;
};
