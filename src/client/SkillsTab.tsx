import { useEffect, useState } from "react";
import { CircleAlert, FolderOpen, Layers, Plus, TriangleAlert } from "lucide-react";
import type { ResourceView, SkillsView } from "../shared/resources";
import { loadSkills, restoreSettings, saveSkills, setModelInvocation } from "./api";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Empty, EmptyDescription } from "./components/ui/empty";
import { Switch } from "./components/ui/switch";
import { NewResourceForm, ResourceEditor } from "./ResourceEditor";
import { Feedback } from "./Feedback";
import { PageHeader } from "./PageHeader";
import { EmptyDetail, ListItem, Workbench } from "./Workbench";
import { SearchField } from "./SearchField";
import { FilePath } from "./PageHeader";
import { ResourceFolders, type FolderChange } from "./ResourceFolders";

function SkillDetail({ skill, busy, onEdit, onInvocation }: { skill: ResourceView; busy: boolean; onEdit: () => void; onInvocation: (allowed: boolean) => void }) {
  const editable = skill.origin === "top-level";
  return <section className="detail" aria-labelledby="skill-title">
    <header className="detail-header"><h2 id="skill-title">{skill.name}</h2>
      <div className="actions"><Button variant="outline" aria-label={`${editable ? "Edit" : "View"} files of ${skill.name}`} onClick={onEdit}>{editable ? "Edit files" : "View files"}</Button></div></header>
    {!skill.enabled && <Alert role="note"><AlertDescription>Turned off, so Pi does not load it.</AlertDescription></Alert>}
    {skill.shadowedBy && <Alert role="note"><TriangleAlert aria-hidden="true" />
      <AlertTitle>Pi does not load this copy.</AlertTitle>
      <AlertDescription><p>Another skill named {skill.name} comes first:</p><FilePath path={skill.shadowedBy} />
        <p>Turn that one off or rename one of them to use this one.</p></AlertDescription>
    </Alert>}
    <dl className="detail-list">
      <div><dt>Description</dt><dd>{skill.description ?? <span className="muted">None. Pi does not load skills without a description.</span>}</dd></div>
      <div><dt>Invocation</dt><dd>
        {editable && <div className="switch-row"><Switch aria-labelledby="invocation-label" checked={!skill.disableModelInvocation} disabled={busy} onCheckedChange={onInvocation} />
          <span id="invocation-label">Let the model load it</span></div>}
        <p className={editable ? "muted" : undefined}>{skill.disableModelInvocation
          ? <>Only <code>/skill:{skill.name}</code> loads it; the model does not pick it on its own (disable-model-invocation in SKILL.md).</>
          : <>The model may load it when a task matches; <code>/skill:{skill.name}</code> forces it.</>}</p>
      </dd></div>
      <div><dt>Source</dt><dd>{skill.group}</dd></div>
      <div><dt>File</dt><dd><code>{skill.path}</code></dd></div>
    </dl>
  </section>;
}

export function SkillsTab({ project }: { project?: string }) {
  const [view, setView] = useState<SkillsView>();
  const [selected, setSelected] = useState<string>();
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"edit" | "new" | "folders">();
  const [undo, setUndo] = useState<FolderChange["undo"]>();
  const [folders, setFolders] = useState(0);

  async function refresh() {
    setError("");
    try { setView(await loadSkills(project)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read the skills."); }
  }
  useEffect(() => { setSelected(undefined); setMode(undefined); void refresh(); }, [project]);

  async function toggle(skills: ResourceView[], enabled: boolean, label = skills[0]?.name) {
    if (!view || !skills.length) return;
    setBusy(true); setError(""); setMessage(""); setUndo(undefined);
    try {
      // Project skills switch in the project's .pi/settings.json, the others in the global file.
      const scope = skills[0]!.scope === "project" ? "project" : "global";
      setView(await saveSkills(scope, scope === "project" ? view.projectRevision! : view.revision, skills.map(skill => skill.path), enabled, project));
      setMessage(`${label} turned ${enabled ? "on" : "off"}. Applies to new T3Code threads, or after /reload.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change the skills.");
      await refresh();
    } finally { setBusy(false); }
  }

  const skills = view?.skills ?? [];
  const needle = query.trim().toLowerCase();
  const visible = skills.filter(skill => !needle || `${skill.name} ${skill.description ?? ""}`.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name));
  // Groups keep Pi's order; skills are sorted by name inside them.
  const groups = [...new Set(skills.map(skill => skill.group))].filter(group => visible.some(skill => skill.group === group));
  const current = skills.find(skill => skill.path === selected);
  const open = !!mode || !!current;
  const shadowed = skills.filter(skill => skill.shadowedBy).length;
  async function invocation(skill: ResourceView, allowed: boolean) {
    setBusy(true); setError(""); setMessage(""); setUndo(undefined);
    try {
      await setModelInvocation(skill.path, allowed, project);
      await refresh();
      setMessage(`${allowed ? `The model may load ${skill.name} again when a task matches` : `Only /skill:${skill.name} loads ${skill.name} now`}. Applies to new T3Code threads, or after /reload.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not change SKILL.md."); }
    finally { setBusy(false); }
  }
  const folderChanged = (change: FolderChange) => { setMessage(change.message); setUndo(change.undo); void refresh(); };
  async function restore(target: NonNullable<FolderChange["undo"]>) {
    setBusy(true);
    try {
      await restoreSettings(target.scope, target.revision, target.scope === "project" ? project : undefined);
      setUndo(undefined); setMessage("Restored the previous settings.json."); setFolders(version => version + 1); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not restore the file."); }
    finally { setBusy(false); }
  }
  return <>
    <PageHeader title="Skills" description="Skills Pi advertises to the model. Changes apply to new T3Code threads, or after /reload."
      actions={<Button variant="outline" onClick={() => { setMode("new"); setSelected(undefined); }}><Plus aria-hidden="true" />New skill</Button>} />
    <Feedback message={message} onDismiss={() => { setMessage(""); setUndo(undefined); }}
      action={undo && { label: "Undo", disabled: busy, onClick: () => void restore(undo) }} />
    {error && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Could not complete the change</AlertTitle><AlertDescription>{error}</AlertDescription>
      <div className="actions col-start-2 mt-2"><Button variant="outline" size="sm" onClick={() => void refresh()}>Reload</Button></div></Alert>}
    {!view ? !error && <div className="loading" aria-busy="true">Reading skills…</div> : <Workbench open={open} onBack={() => { setSelected(undefined); setMode(undefined); }} backLabel="All skills" list={<section aria-label="Skills list">
      <div className="list-search"><SearchField label="Search skills" placeholder="Search skills…" value={query} onChange={setQuery} /></div>
      <ul className="item-list pinned"><li><ListItem selected={mode === "folders"} onSelect={() => { setMode("folders"); setSelected(undefined); }} icon={FolderOpen} name="Folders" state="where Pi finds skills" /></li></ul>
      <p className="list-count">{skills.filter(skill => skill.enabled).length} of {skills.length} skills on{shadowed > 0 && `, ${shadowed} not loaded (same name)`}</p>
      {!visible.length && <Empty><EmptyDescription>{skills.length ? `No skills match “${query.trim()}”.` : "No skills found. Create one, or add skill folders to ~/.pi/agent/skills."}</EmptyDescription></Empty>}
      {groups.map(group => {
        const members = visible.filter(skill => skill.group === group);
        const allOn = members.every(skill => skill.enabled);
        return <div key={group} className="item-group">
          <div className="list-header"><h2>{group}</h2>
            <Switch aria-label={`Enable every skill in ${group}`} checked={allOn} disabled={busy}
              onCheckedChange={enabled => void toggle(members.filter(skill => skill.enabled !== enabled), enabled, `All skills in ${group}`)} /></div>
          <ul className="item-list">{members.map(skill => <li key={skill.path}>
            <ListItem selected={skill.path === selected} onSelect={() => { setSelected(skill.path); setMode(undefined); }} name={skill.name}
              tone={skill.shadowedBy ? "shadowed" : undefined}
              state={skill.shadowedBy ? <><TriangleAlert aria-hidden="true" />not loaded</> : !skill.enabled ? "off" : skill.disableModelInvocation ? "command only" : ""} />
            <Switch aria-label={`Enable ${skill.name}`} checked={skill.enabled} disabled={busy} onCheckedChange={enabled => void toggle([skill], enabled)} />
          </li>)}</ul>
        </div>;
      })}
    </section>} detail={mode === "folders" ? <div className="detail"><ResourceFolders key={folders} type="skills" project={project} level={2} onChanged={folderChanged} /></div>
        : mode === "new" ? <NewResourceForm type="skills" project={project} onCancel={() => setMode(undefined)}
          onCreated={async (path, name) => { await refresh(); setSelected(path); setMode("edit"); setMessage(`Created ${name}. Applies to new T3Code threads, or after /reload.`); }} />
        : current && mode === "edit" ? <ResourceEditor key={current.path} type="skills" path={current.path} name={current.name} editable={current.origin === "top-level"}
          project={project} onMessage={setMessage} onClose={() => { setMode(undefined); void refresh(); }} />
        : current ? <SkillDetail skill={current} busy={busy} onEdit={() => setMode("edit")} onInvocation={allowed => void invocation(current, allowed)} />
        : <EmptyDetail icon={Layers} title="No skill selected">Choose a skill to read its description and how the model reaches it, or create a new one.</EmptyDetail>} />}
  </>;
}
