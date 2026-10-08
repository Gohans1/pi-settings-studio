import { useEffect, useState } from "react";
import { FolderOpen, Layers, Plus, TriangleAlert } from "lucide-react";
import type { ResourceView, SkillsView } from "../shared/resources";
import { loadSkills, restoreSettings, saveSkills } from "./api";
import { Button } from "./components/ui/button";
import { Switch } from "./components/ui/switch";
import { NewResourceForm, ResourceEditor } from "./ResourceEditor";
import { Feedback } from "./Feedback";
import { PageHeader } from "./PageHeader";
import { EmptyDetail, Workbench } from "./Workbench";
import { SearchField } from "./SearchField";
import { FilePath } from "./PageHeader";
import { ResourceFolders, type FolderChange } from "./ResourceFolders";

function SkillDetail({ skill, onEdit }: { skill: ResourceView; onEdit: () => void }) {
  const editable = skill.origin === "top-level";
  return <section className="detail" aria-labelledby="skill-title">
    <header className="detail-header"><h2 id="skill-title">{skill.name}</h2>
      <div className="actions"><Button variant="outline" aria-label={`${editable ? "Edit" : "View"} files of ${skill.name}`} onClick={onEdit}>{editable ? "Edit files" : "View files"}</Button></div></header>
    {!skill.enabled && <p className="notice">Turned off, so Pi does not load it.</p>}
    {skill.shadowedBy && <div className="notice callout-warning">
      <p><strong>Pi does not load this copy.</strong> Another skill named {skill.name} comes first:</p>
      <FilePath path={skill.shadowedBy} />
      <p>Turn that one off or rename one of them to use this one.</p>
    </div>}
    <dl className="detail-list">
      <div><dt>Description</dt><dd>{skill.description ?? <span className="muted">None. Pi does not load skills without a description.</span>}</dd></div>
      <div><dt>Invocation</dt><dd>{skill.disableModelInvocation
        ? <>Only through <code>/skill:{skill.name}</code>. The model does not pick it on its own (disable-model-invocation).</>
        : <>The model may load it when a task matches; <code>/skill:{skill.name}</code> forces it.</>}</dd></div>
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
    {error && <div role="alert" className="error"><strong>Could not complete the change</strong><p>{error}</p><div className="actions"><Button variant="outline" size="sm" onClick={() => void refresh()}>Reload</Button></div></div>}
    {!view ? !error && <div className="loading" aria-busy="true">Reading skills…</div> : <Workbench open={open} onBack={() => { setSelected(undefined); setMode(undefined); }} backLabel="All skills" list={<section aria-label="Skills list">
      <div className="list-search"><SearchField label="Search skills" placeholder="Search skills…" value={query} onChange={setQuery} /></div>
      <ul className="item-list pinned"><li><button type="button" aria-pressed={mode === "folders"} onClick={() => { setMode("folders"); setSelected(undefined); }}>
        <FolderOpen aria-hidden="true" /><span className="item-name">Folders</span><span className="item-state">where Pi finds skills</span></button></li></ul>
      <p className="list-count">{skills.filter(skill => skill.enabled).length} of {skills.length} skills on{shadowed > 0 && `, ${shadowed} not loaded (same name)`}</p>
      {!visible.length && <p className="empty">{skills.length ? `No skills match “${query.trim()}”.` : "No skills found. Create one, or add skill folders to ~/.pi/agent/skills."}</p>}
      {groups.map(group => {
        const members = visible.filter(skill => skill.group === group);
        const allOn = members.every(skill => skill.enabled);
        return <div key={group} className="item-group">
          <div className="list-header"><h2>{group}</h2>
            <Switch aria-label={`Enable every skill in ${group}`} checked={allOn} disabled={busy}
              onCheckedChange={enabled => void toggle(members.filter(skill => skill.enabled !== enabled), enabled, `All skills in ${group}`)} /></div>
          <ul className="item-list">{members.map(skill => <li key={skill.path}>
            <button type="button" aria-pressed={skill.path === selected} onClick={() => { setSelected(skill.path); setMode(undefined); }}>
              <span className="item-name">{skill.name}</span>
              {skill.shadowedBy ? <span className="item-state" data-state="shadowed"><TriangleAlert aria-hidden="true" />not loaded</span>
                : <span className="item-state">{!skill.enabled ? "off" : skill.disableModelInvocation ? "command only" : ""}</span>}
            </button>
            <Switch aria-label={`Enable ${skill.name}`} checked={skill.enabled} disabled={busy} onCheckedChange={enabled => void toggle([skill], enabled)} />
          </li>)}</ul>
        </div>;
      })}
    </section>} detail={mode === "folders" ? <div className="detail"><ResourceFolders key={folders} type="skills" project={project} level={2} onChanged={folderChanged} /></div>
        : mode === "new" ? <NewResourceForm type="skills" project={project} onCancel={() => setMode(undefined)}
          onCreated={async (path, name) => { await refresh(); setSelected(path); setMode("edit"); setMessage(`Created ${name}. Applies to new T3Code threads, or after /reload.`); }} />
        : current && mode === "edit" ? <ResourceEditor key={current.path} type="skills" path={current.path} name={current.name} editable={current.origin === "top-level"}
          project={project} onMessage={setMessage} onClose={() => { setMode(undefined); void refresh(); }} />
        : current ? <SkillDetail skill={current} onEdit={() => setMode("edit")} />
        : <EmptyDetail icon={Layers} title="No skill selected">Choose a skill to read its description and how the model reaches it, or create a new one.</EmptyDetail>} />}
  </>;
}
