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
  /**
   * The first request: its prompt, the declarations it carried, and Pi's estimate of both. `leftOut`: declarations Pi
   * recorded but left out of requests (code mode only). `leftOutUnknown`: code mode was on and the prompt cannot tell.
   */
  start?: { at: number; content?: PromptPart; sections: PromptPart[]; declarations: PromptPart[]; leftOut: PromptPart[]; leftOutUnknown?: true; tokens: number };
  changes: PromptChange[];
  /** The prompt after every change, as Pi renders it: content, then the sections. */
  text: string;
};
