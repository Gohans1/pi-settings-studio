export type SessionSummary = {
  id: string;
  cwd: string;
  /** The session name, else the start of the first message. */
  title: string;
  modified: string;
  messageCount: number;
};

export type SystemPromptView = {
  id: string;
  cwd: string;
  sections: { name: string; text: string }[];
  /** Text outside named sections (older sessions). */
  content: string;
  tools: { name: string; description: string }[];
  /** The full prompt as Pi renders it: content, then the sections. */
  text: string;
};
