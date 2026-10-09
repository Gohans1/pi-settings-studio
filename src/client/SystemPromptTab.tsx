import { useState } from "react";
import { CircleAlert, Copy } from "lucide-react";
import type { SessionSummary, SystemPromptView } from "../shared/sessions";
import { loadSessions, loadSystemPrompt } from "./api";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "./components/ui/empty";
import { Field, FieldLabel } from "./components/ui/field";
import { Spinner } from "./components/ui/spinner";
import { ScrollArea } from "./components/ui/scroll-area";
import { OptionSelect } from "./OptionSelect";
import { Feedback } from "./Feedback";
import { PageHeader } from "./PageHeader";
import { useCached } from "./useCached";

const count = (text: string) => `${text.length.toLocaleString("en")} characters`;

export function SystemPromptTab({ project }: { project?: string }) {
  const listing = useCached<SessionSummary[]>("sessions", signal => loadSessions(signal));
  const sessions = listing.data;
  const [chosen, setChosen] = useState("");
  const [copyError, setCopyError] = useState("");
  const [message, setMessage] = useState("");
  const projectSessions = (sessions ?? []).filter(session => session.cwd === project);
  // The session chosen in this project, else its newest (the list is newest first).
  const sessionId = projectSessions.some(session => session.id === chosen) ? chosen : projectSessions[0]?.id ?? "";
  const recorded = useCached<SystemPromptView>(sessionId ? `prompt\0${sessionId}` : undefined, signal => loadSystemPrompt(sessionId, signal));
  const prompt = recorded.data;
  const error = listing.error || recorded.error || copyError;
  const checking = (listing.loading && !!sessions) || (recorded.loading && !!prompt);
  function choose(id: string) { setChosen(id); setCopyError(""); setMessage(""); }

  async function copy() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt.text);
      setCopyError(""); setMessage(`Copied ${count(prompt.text)}.`);
    } catch { setCopyError("The browser did not allow copying. Select the text instead."); }
  }

  return <>
    <PageHeader title="System prompt" description="Exactly what Pi recorded for a session: the prompt sections and tool declarations the model received. Read-only." />
    <Feedback message={message} onDismiss={() => setMessage("")} />
    {error && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Could not show the prompt</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {checking && <p className="loading" role="status"><Spinner aria-hidden="true" />Checking for changes…</p>}
    {!sessions ? !error && <div className="loading" aria-busy="true"><Spinner />Reading sessions…</div>
      : !project ? <Alert role="note"><AlertDescription>Choose a project at the top to see its sessions.</AlertDescription></Alert>
      : !projectSessions.length ? <Empty><EmptyHeader><EmptyDescription>This project has no Pi sessions yet. Start a Pi session, then come back.</EmptyDescription></EmptyHeader></Empty>
      : <>
        <Field className="mb-5 max-w-180"><FieldLabel htmlFor="prompt-session">Session</FieldLabel>
          <OptionSelect id="prompt-session" className="w-full" value={sessionId} onChange={choose}
            options={projectSessions.map(session => ({ value: session.id, label: `${new Date(session.modified).toLocaleString()} — ${session.title}` }))} /></Field>
        {!prompt ? !error && sessionId && <div className="loading" aria-busy="true"><Spinner />Reading the session…</div>
          : !prompt.text && !prompt.tools.length ? <Alert role="note"><AlertDescription>This session has no recorded system prompt. Sessions record it on their first request.</AlertDescription></Alert>
          : <section className="prompt" aria-labelledby="recorded-prompt">
            {/* The outline for the sections' h3 headings (Base UI's Accordion.Header). */}
            <h2 id="recorded-prompt" className="sr-only">Recorded prompt</h2>
            <div className="prompt-summary"><span>{prompt.sections.length} sections · {prompt.tools.length} tools · {count(prompt.text)}</span>
              <Button variant="outline" size="sm" onClick={() => void copy()}><Copy aria-hidden="true" data-icon="inline-start" />Copy full prompt</Button></div>
            {/* Closed sections stay in the page (hidden until found), so the browser's find still reaches them. */}
            <Accordion multiple hiddenUntilFound defaultValue={["#base"]}>
              {prompt.content && <AccordionItem value="#base"><AccordionTrigger><span>Base prompt <span className="muted">{count(prompt.content)}</span></span></AccordionTrigger>
                <AccordionContent><ScrollArea className="flex max-h-120 flex-col"><pre>{prompt.content}</pre></ScrollArea></AccordionContent></AccordionItem>}
              {prompt.sections.map(section => <AccordionItem key={section.name} value={section.name}>
                <AccordionTrigger><span>{section.name} <span className="muted">{count(section.text)}</span></span></AccordionTrigger>
                <AccordionContent><ScrollArea className="flex max-h-120 flex-col"><pre>{section.text}</pre></ScrollArea></AccordionContent>
              </AccordionItem>)}
              <AccordionItem value="#tools"><AccordionTrigger>Tools ({prompt.tools.length})</AccordionTrigger>
                <AccordionContent><ul className="tool-list" aria-label="Tools">{prompt.tools.map(tool => <li key={tool.name}><code>{tool.name}</code><span className="muted">{tool.description}</span></li>)}</ul></AccordionContent>
              </AccordionItem>
            </Accordion>
          </section>}
      </>}
  </>;
}
