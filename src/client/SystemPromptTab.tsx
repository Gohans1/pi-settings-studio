import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import type { SessionSummary, SystemPromptView } from "../shared/sessions";
import { loadSessions, loadSystemPrompt } from "./api";
import { Button } from "./components/ui/button";
import { Feedback } from "./Feedback";
import { PageHeader } from "./PageHeader";

const count = (text: string) => `${text.length.toLocaleString("en")} characters`;

export function SystemPromptTab({ project }: { project?: string }) {
  const [sessions, setSessions] = useState<SessionSummary[]>();
  const [sessionId, setSessionId] = useState("");
  const [prompt, setPrompt] = useState<SystemPromptView>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadSessions().then(setSessions).catch(cause => setError(cause instanceof Error ? cause.message : "Could not list sessions."));
  }, []);
  // The newest session of the project chosen at the top.
  useEffect(() => { setSessionId((sessions ?? []).find(session => session.cwd === project)?.id ?? ""); }, [sessions, project]);
  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    setPrompt(undefined); setError(""); setMessage("");
    loadSystemPrompt(sessionId).then(view => { if (active) setPrompt(view); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not read the session."); });
    return () => { active = false; };
  }, [sessionId]);

  const projectSessions = (sessions ?? []).filter(session => session.cwd === project);
  async function copy() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt.text);
      setMessage(`Copied ${count(prompt.text)}.`);
    } catch { setError("The browser did not allow copying. Select the text instead."); }
  }

  return <>
    <PageHeader title="System prompt" description="Exactly what Pi recorded for a session: the prompt sections and tool declarations the model received. Read-only." />
    <Feedback message={message} onDismiss={() => setMessage("")} />
    {error && <div role="alert" className="error"><strong>Could not show the prompt</strong><p>{error}</p></div>}
    {!sessions ? !error && <div className="loading" aria-busy="true">Reading sessions…</div>
      : !project ? <p className="notice">Choose a project at the top to see its sessions.</p>
      : !projectSessions.length ? <p className="empty">This project has no Pi sessions yet. Start a thread in T3Code, then come back.</p>
      : <>
        <div className="prompt-pickers">
          <label>Session<select value={sessionId} onChange={event => setSessionId(event.target.value)}>
            {projectSessions.map(session => <option key={session.id} value={session.id}>
              {new Date(session.modified).toLocaleString()} — {session.title}
            </option>)}
          </select></label>
        </div>
        {!prompt ? !error && sessionId && <div className="loading" aria-busy="true">Reading the session…</div>
          : !prompt.text && !prompt.tools.length ? <p className="notice">This session has no recorded system prompt. Sessions record it on their first request.</p>
          : <section className="prompt" aria-label="Recorded prompt">
            <div className="prompt-summary"><span>{prompt.sections.length} sections · {prompt.tools.length} tools · {count(prompt.text)}</span>
              <Button variant="outline" size="sm" onClick={() => void copy()}><Copy aria-hidden="true" />Copy full prompt</Button></div>
            {prompt.content && <details open aria-label="Base prompt"><summary>Base prompt <span className="muted">{count(prompt.content)}</span></summary><pre>{prompt.content}</pre></details>}
            {prompt.sections.map(section => <details key={section.name} aria-label={`${section.name} section`}>
              <summary>{section.name} <span className="muted">{count(section.text)}</span></summary><pre>{section.text}</pre>
            </details>)}
            <details><summary>Tools ({prompt.tools.length})</summary>
              <ul className="tool-list" aria-label="Tools">{prompt.tools.map(tool => <li key={tool.name}><code>{tool.name}</code><span className="muted">{tool.description}</span></li>)}</ul>
            </details>
          </section>}
      </>}
  </>;
}
