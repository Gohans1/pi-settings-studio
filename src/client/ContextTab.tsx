import { useId, useMemo, useState, type ReactNode } from "react";
import { CircleAlert, Copy, RefreshCw, TriangleAlert } from "lucide-react";
import type { ToolsView } from "../shared/plugin-tools";
import type { PromptChange, PromptPart, SessionSummary, SystemPromptView } from "../shared/sessions";
import { loadSessions, loadSystemPrompt, loadTools } from "./api";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Button, buttonVariants } from "./components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "./components/ui/empty";
import { Field, FieldLabel } from "./components/ui/field";
import { ItemGroup } from "./components/ui/item";
import { Spinner } from "./components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group";
import { Feedback } from "./Feedback";
import { OptionSelect } from "./OptionSelect";
import { FilePath, PageHeader } from "./PageHeader";
import { PART_TABS, codemodeListed, sectionInfo, tokens } from "./prompt-parts";
import { TAB_NAMES } from "./ToolRows";
import { buildCatalog, type Catalog } from "./tool-catalog";
import { useCached } from "./useCached";
import { ListItem, Workbench } from "./Workbench";

type Mode = "next" | "recorded";
type Context = ToolsView["context"];
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const sum = (parts: PromptPart[]) => parts.reduce((total, part) => total + part.tokens, 0);
const time = (at: number) => new Date(at).toLocaleTimeString();

/** One row of the parts list and what the detail pane shows for it. */
type Entry = { key: string; name: string; state: string; detail: () => ReactNode };
type Group = { title: string; state: string; entries: Entry[] };

/** The parts of a prompt in Pi's order, by group, beside the chosen part. */
function Parts({ groups }: { groups: Group[] }) {
  const id = useId();
  const [chosen, setChosen] = useState<string>();
  const [open, setOpen] = useState(false);
  const entries = groups.flatMap(group => group.entries);
  // A part no longer there (another session, a refresh) falls back to the first.
  const shown = entries.find(entry => entry.key === chosen) ?? entries[0];
  const list = <section aria-label="Context parts">{groups.map((group, index) => group.entries.length > 0 && <section key={group.title} className="item-group" aria-labelledby={`${id}-${index}`}>
    <div className="list-header"><h2 id={`${id}-${index}`}>{group.title}</h2><span>{group.state}</span></div>
    <ItemGroup aria-labelledby={`${id}-${index}`}>{group.entries.map(entry => <div role="listitem" key={entry.key}>
      <ListItem selected={shown?.key === entry.key} onSelect={() => { setChosen(entry.key); setOpen(true); }} name={entry.name} state={entry.state} />
    </div>)}</ItemGroup>
  </section>)}</section>;
  return <Workbench list={list} detail={shown?.detail()} open={open} onBack={() => setOpen(false)} backLabel="All parts" />;
}

function NameList({ label, names }: { label: string; names: string[] }) {
  return names.length ? <ul className="name-list" aria-label={label}>{names.map(name => <li key={name}><code translate="no">{name}</code></li>)}</ul> : <p className="muted">None.</p>;
}

const size = (part: PromptPart) => `≈ ${tokens(part.tokens)} · ${part.text.length.toLocaleString("en")} characters`;

/** A section of the system prompt: what it is, its size, where it comes from and its text. */
function SectionDetail({ part, from }: { part: PromptPart; from?: ReactNode }) {
  const { label, about, tab } = sectionInfo(part.name);
  return <div className="detail">
    <header className="detail-header"><h2>{label}</h2>
      {tab && <div className="actions"><a className={buttonVariants({ variant: "outline", size: "sm" })} href={"#" + tab}>Edit in {PART_TABS[tab]}</a></div>}</header>
    <p className="tools-note">{about}</p>
    <dl className="detail-list">
      <div><dt>Size</dt><dd>{size(part)}</dd></div>
      {from && <div><dt>From</dt><dd>{from}</dd></div>}
    </dl>
    <div className="prompt-preview"><pre>{part.text}</pre></div>
  </div>;
}

/** A tool declaration as the model reads it; code mode's also says which tools its description carries. */
function DeclarationDetail({ part, catalog }: { part: PromptPart; catalog?: Catalog }) {
  const tool = catalog?.tools.find(entry => entry.name === part.name);
  const source = tool && catalog!.byKey.get(tool.sourceKey);
  const codemode = part.name === "codemode";
  const listed = codemode ? codemodeListed((JSON.parse(part.text) as { description: string }).description) : [];
  const scripts = codemode && catalog ? catalog.tools.filter(entry => entry.reach === "demand" && !listed.includes(entry.name)).map(entry => entry.name) : [];
  return <div className="detail">
    <header className="detail-header"><h2 translate="no">{part.name}</h2>
      {source && <div className="actions"><a className={buttonVariants({ variant: "outline", size: "sm" })} href={"#" + source.tab}>Change in {TAB_NAMES[source.tab]}</a></div>}</header>
    <p className="tools-note">A tool declaration: its name, description and parameters, as the model reads them with every request.</p>
    <dl className="detail-list">
      <div><dt>Size</dt><dd>{size(part)}</dd></div>
      {source && <div><dt>From</dt><dd>{source.title}{source.detail ? ` · ${source.detail}` : ""}</dd></div>}
      {codemode && <div><dt>Its catalog</dt><dd>
        <p>Its description lists {count(listed.length, "tool", "tools")} by declaration, within code mode's inline budget.</p>
        <NameList label="Listed in its description" names={listed} />
        {catalog && <><p>Scripts find {count(scripts.length, "more tool", "more tools")} by name or search.</p><NameList label="Found from scripts" names={scripts} /></>}
      </dd></div>}
    </dl>
    <div className="prompt-preview"><pre>{part.text}</pre></div>
  </div>;
}

function changeSummary(change: PromptChange) {
  const parts = [
    change.added.length > 0 && `${count(change.added.length, "tool", "tools")} added`,
    change.removed.length > 0 && `${count(change.removed.length, "tool", "tools")} removed`,
    change.sections.length > 0 && `${count(change.sections.length, "section", "sections")} changed`,
    change.content && "instructions added",
  ].filter(Boolean);
  return parts.join(", ") || "No change";
}

function ChangeDetail({ change }: { change: PromptChange }) {
  return <div className="detail">
    <header className="detail-header"><h2>Change at {new Date(change.at).toLocaleString()}</h2></header>
    <p className="tools-note">A later system message. A model that takes system messages mid-conversation gets it in place; for others Pi rebuilds the leading prompt with it.</p>
    <dl className="detail-list">
      {change.added.length > 0 && <div><dt>Tools added</dt><dd><p>≈ {tokens(sum(change.added))}</p><NameList label="Tools added" names={change.added.map(part => part.name)} /></dd></div>}
      {change.removed.length > 0 && <div><dt>Tools removed</dt><dd><NameList label="Tools removed" names={change.removed} /></dd></div>}
      {change.sections.map(section => <div key={section.name}><dt>{sectionInfo(section.name).label}</dt><dd>{section.text === null ? "Removed" : "Replaced"}</dd></div>)}
    </dl>
    {change.content && <div className="prompt-preview"><h3>Added instructions</h3><pre>{change.content}</pre></div>}
    {change.sections.flatMap(section => section.text === null ? [] : [<div key={section.name} className="prompt-preview"><h3>{sectionInfo(section.name).label}</h3><pre>{section.text}</pre></div>])}
  </div>;
}

/** The prompt and declaration groups, shared by a new session and a recorded one. */
function promptGroups(parts: { content?: PromptPart; sections: PromptPart[]; declarations: PromptPart[] }, from: (part: PromptPart) => ReactNode, catalog?: Catalog): Group[] {
  const prompt = [...(parts.content ? [parts.content] : []), ...parts.sections];
  return [
    { title: "System prompt", state: tokens(sum(prompt)), entries: prompt.map(part => ({
      key: `section:${part.name}`, name: sectionInfo(part.name).label, state: tokens(part.tokens), detail: () => <SectionDetail part={part} from={from(part)} />,
    })) },
    { title: "Tool declarations", state: tokens(sum(parts.declarations)), entries: parts.declarations.map(part => ({
      key: `tool:${part.name}`, name: part.name, state: tokens(part.tokens), detail: () => <DeclarationDetail part={part} catalog={catalog} />,
    })) },
  ];
}

/** Where a new session's section comes from, where the inspection knows the files. */
function filesOf(context: Context) {
  return (part: PromptPart): ReactNode => {
    const { files } = context;
    if (part.name === "preamble") return files.systemPrompt ? <FilePath path={files.systemPrompt} /> : "Pi";
    if (part.name === "addendum") return files.appendSystemPrompt.map(path => <p key={path}><FilePath path={path} /></p>);
    if (part.name === "project_context") return files.contextFiles.map(file => <p key={file.path}><FilePath path={file.path} /> <span className="muted">{tokens(file.tokens)}</span></p>);
    if (part.name === "mcp_servers") return "Pi's MCP extension, from mcp.json";
    return undefined;
  };
}

function Overview({ context, catalog }: { context: Context; catalog: Catalog }) {
  const prompt = sum([...(context.content ? [context.content] : []), ...context.sections]);
  const demand = catalog.tools.filter(tool => tool.reach === "demand").length;
  return <div className="tools-overview">
    <p>A new session here starts with <strong>≈ {tokens(context.tokens)}</strong> before your first message: <strong>{tokens(prompt)}</strong> of system prompt
      and <strong>{tokens(sum(context.declarations))}</strong> in {count(context.declarations.length, "tool declaration", "tool declarations")}.</p>
    <p>Not counted until used: {demand > 0 && <><a href="#tools">{count(demand, "tool", "tools")} on demand</a> and </>}each skill's file, read when a task needs it.</p>
  </div>;
}

function NextSession({ project, modes }: { project: string; modes: ReactNode }) {
  const { data: view, error, loading, refresh } = useCached<ToolsView>(`tools\0${project}`, (signal, fresh) => loadTools(project, signal, fresh));
  const catalog = useMemo(() => view && buildCatalog(view), [view]);
  return <>
    <div className="context-bar">{modes}
      <Button variant="outline" size="sm" disabled={loading} onClick={refresh}><RefreshCw aria-hidden="true" data-icon="inline-start" />Refresh</Button></div>
    {loading && <p className="loading" role="status"><Spinner aria-hidden="true" />{view ? "Checking for changes…" : "Starting Pi to see what a new session gets…"}</p>}
    {error && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>{view ? "Could not check again" : "Could not start Pi"}</AlertTitle><AlertDescription>{error} Try Refresh.</AlertDescription></Alert>}
    {view && catalog && <>
      {!view.complete && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Could not verify everything</AlertTitle>
        <AlertDescription><p>An extension or MCP server failed, so parts may be missing. Fix it, then Refresh.</p>
          {view.issues.map((issue, index) => <p key={index} className="break-words">{issue}</p>)}</AlertDescription></Alert>}
      <Overview context={view.context} catalog={catalog} />
      {view.context.unrun.length > 0 && <Alert role="note"><TriangleAlert aria-hidden="true" /><AlertDescription>
        <p>Not run in this preview: these extensions can change the prompt when a turn starts, so a session's first request may differ.</p>
        <ul className="name-list" aria-label="Extensions not run">{view.context.unrun.map((source, index) => <li key={index}>
          {source.kind === "extension" ? <>{source.name}{source.group ? <span className="muted"> · {source.group}</span> : null}</> : source.kind === "mcp" ? source.server : "Pi"}</li>)}</ul>
      </AlertDescription></Alert>}
      <Parts groups={promptGroups(view.context, filesOf(view.context), catalog)} />
      <p className="tools-footnote">A preview of Pi started in this folder, from global and project settings, the project trusted for it. Checked {new Date(view.checkedAt).toLocaleTimeString()}.
        Hosts that start Pi, such as T3 Code, can add tools of their own, and a provider can put instructions before Pi's.</p>
    </>}
  </>;
}

function RecordedSession({ project, modes }: { project: string; modes: ReactNode }) {
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
      setCopyError(""); setMessage(`Copied ${prompt.text.length.toLocaleString("en")} characters.`);
    } catch { setCopyError("The browser did not allow copying. Select the text instead."); }
  }

  const start = prompt?.start;
  return <>
    <div className="context-bar">{modes}
      <Button variant="outline" size="sm" disabled={!prompt?.text} onClick={() => void copy()}><Copy aria-hidden="true" data-icon="inline-start" />Copy latest prompt</Button></div>
    <Feedback message={message} onDismiss={() => setMessage("")} />
    {error && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Could not show the session</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {checking && <p className="loading" role="status"><Spinner aria-hidden="true" />Checking for changes…</p>}
    {!sessions ? !error && <div className="loading" aria-busy="true"><Spinner />Reading sessions…</div>
      : !projectSessions.length ? <Empty><EmptyHeader><EmptyDescription>This project has no Pi sessions yet. Start a Pi session, then come back.</EmptyDescription></EmptyHeader></Empty>
      : <>
        <Field className="mb-5 max-w-180"><FieldLabel htmlFor="context-session">Session</FieldLabel>
          <OptionSelect id="context-session" className="w-full" value={sessionId} onChange={choose}
            options={projectSessions.map(session => ({ value: session.id, label: `${new Date(session.modified).toLocaleString()} — ${session.title}` }))} /></Field>
        {!prompt ? !error && sessionId && <div className="loading" aria-busy="true"><Spinner />Reading the session…</div>
          : !start ? <Alert role="note"><AlertDescription>This session has no recorded system prompt. Sessions record it on their first request.</AlertDescription></Alert>
          : <>
            <div className="tools-overview"><p>Pi recorded <strong>≈ {tokens(start.tokens)}</strong> for the session's first request,
              {prompt.changes.length ? <> then changed it {count(prompt.changes.length, "time", "times")}.</> : " and did not change it after that."}</p></div>
            {start.declarations.some(part => part.name === "codemode") && <Alert role="note"><TriangleAlert aria-hidden="true" /><AlertDescription>
              Pi records every tool it declares. With code mode set to only, it leaves its direct tools out of each request, and the session file does not say which. Next session shows what Pi sends.
            </AlertDescription></Alert>}
            <Parts groups={[...promptGroups(start, () => undefined), { title: "Later changes", state: String(prompt.changes.length), entries: prompt.changes.map((change, index) => ({
              key: `change:${index}`, name: time(change.at), state: changeSummary(change), detail: () => <ChangeDetail change={change} />,
            })) }]} />
          </>}
      </>}
  </>;
}

export function ContextTab({ project }: { project?: string }) {
  const [mode, setMode] = useState<Mode>("next");
  const modes = <ToggleGroup aria-label="Which session" variant="outline" size="sm" value={[mode]} onValueChange={next => { if (next.length) setMode(next[0] as Mode); }}>
    <ToggleGroupItem value="next">Next session</ToggleGroupItem>
    <ToggleGroupItem value="recorded">Recorded session</ToggleGroupItem>
  </ToggleGroup>;
  return <>
    <PageHeader title="Context" description="What a session puts in front of the model before your first message, part by part, in the order Pi builds it. Read-only." />
    {!project ? <Alert role="note"><AlertDescription>Choose a project at the top. A session's prompt depends on the folder it runs in.</AlertDescription></Alert>
      : mode === "next" ? <NextSession project={project} modes={modes} /> : <RecordedSession project={project} modes={modes} />}
  </>;
}
