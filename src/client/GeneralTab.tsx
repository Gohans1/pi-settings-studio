import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { cn } from "cn";
import { ChevronDown, CircleAlert, FileJson, History, RotateCcw } from "lucide-react";
import { fields, sections, type Field, type SettingsChange, type SettingsView } from "../shared/settings";
import { loadModelIds, loadRawSettings, loadSettings, restoreSettings, saveRawSettings, saveSettings } from "./api";
import { SettingField } from "./SettingField";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./components/ui/alert-dialog";
import { Button, buttonVariants } from "./components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./components/ui/dropdown-menu";
import { FieldGroup, FieldSeparator } from "./components/ui/field";
import { Separator } from "./components/ui/separator";
import { Disclosure } from "./Disclosure";
import { Feedback } from "./Feedback";
import { PageHeader } from "./PageHeader";
import { PiPanel } from "./PiPanel";
import { NotHere } from "./NotHere";
import { RawJsonEditor } from "./RawJsonEditor";
import { KeybindingsPanel } from "./KeybindingsPanel";
import { SearchField } from "./SearchField";
import { ScopeChoice } from "./ScopeChoice";
import { Empty, EmptyDescription, EmptyHeader } from "./components/ui/empty";
import { Spinner } from "./components/ui/spinner";

const KEYBINDINGS = { id: "keybindings", title: "Keyboard shortcuts" };

/** The group the reader is in: the last one whose top has passed the upper third of the scroller. */
function useCurrentGroup(ids: string[]) {
  const [current, setCurrent] = useState<string>();
  const key = ids.join(" ");
  useEffect(() => {
    const visible = new Set<string>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const id = entry.target.id.slice("group-".length);
        if (entry.isIntersecting) visible.add(id); else visible.delete(id);
      }
      const first = ids.find(id => visible.has(id));
      if (first) setCurrent(first);
    }, { root: document.getElementById("main"), rootMargin: "-8px 0px -66% 0px" });
    for (const id of ids) { const element = document.getElementById("group-" + id); if (element) observer.observe(element); }
    return () => observer.disconnect();
  }, [key]);
  // Before the reader scrolls (or when the list changes), the first group is current.
  return [current && ids.includes(current) ? current : ids[0], setCurrent] as const;
}

export function GeneralTab({ project }: { project?: string }) {
  // The project's own .pi/settings.json overrides the global file key by key.
  const [scopeChoice, setScopeChoice] = useState<"global" | "project">("global");
  const scope = project ? scopeChoice : "global";
  const target = scope === "project" ? project : undefined;
  const loadRaw = useCallback(() => loadRawSettings(scope, target), [scope, target]);
  const saveRaw = useCallback((revision: string, text: string) => saveRawSettings(revision, text, scope, target), [scope, target]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<SettingsView>();
  const [draft, setDraft] = useState<Record<string, SettingsChange>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [restore, setRestore] = useState(false);
  const [raw, setRaw] = useState(false);
  const [modelIds, setModelIds] = useState<string[]>([]);
  // Groups whose advanced toggle the reader opened or closed; the rest follow the file.
  const [advancedOpen, setAdvancedOpen] = useState<Record<string, boolean>>({});
  useEffect(() => { loadModelIds().then(setModelIds).catch(() => setModelIds([])); }, []);
  const title = useRef<HTMLHeadingElement>(null);
  const changes = Object.values(draft).map(change => {
    if (!("value" in change)) return change;
    const parsed = fields.find(field => field.key === change.key)?.schema.safeParse(change.value);
    return parsed?.success ? { key: change.key, value: parsed.data } : change;
  });
  const invalidKeys = changes.filter(change => "value" in change &&
    !fields.find(f => f.key === change.key)?.schema.safeParse(change.value).success).map(change => change.key);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setMessage(""); setView(undefined);
    setDraft({}); setAdvancedOpen({});
    void loadSettings(scope, target).then(data => {
      if (active) setView(data);
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [scope, target]);
  useEffect(() => {
    if (!changes.length) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changes.length]);

  function change(key: string, value: unknown) {
    setMessage("");
    setDraft(current => {
      const next = { ...current };
      if (JSON.stringify(view?.values[key]) === JSON.stringify(value)) delete next[key];
      else next[key] = { key, value };
      return next;
    });
  }
  function reset(key: string) {
    setDraft(current => {
      const next = { ...current };
      if (view && Object.hasOwn(view.values, key)) next[key] = { key, remove: true };
      else delete next[key];
      return next;
    });
    setMessage("");
  }
  async function save() {
    if (!view) return;
    // Pi would refuse the file: take the reader to the first value to fix, and write nothing.
    if (invalidKeys.length) {
      // A folded group would leave focus nowhere: open it first.
      const field = fields.find(f => f.key === invalidKeys[0]);
      if (field?.advanced) flushSync(() => setAdvancedOpen(open => ({ ...open, [field.section]: true })));
      document.getElementById("row-" + invalidKeys[0])?.querySelector<HTMLElement>("[data-slot=input], [data-slot=textarea], [data-slot=select-trigger], [data-slot=switch]")?.focus();
      return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      setView(await saveSettings(scope, view.revision, changes, target));
      setDraft({}); setMessage("Saved to file. Reload Pi or start a new session to apply supported settings.");
      title.current?.focus({ preventScroll: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Save failed. Your draft is unchanged."); }
    finally { setBusy(false); }
  }
  async function recover() {
    if (!view) return;
    setBusy(true); setError(""); setMessage("");
    try {
      setView(await restoreSettings(scope, view.revision, target));
      setRestore(false); setMessage("Previous file restored. Reload Pi to apply the change.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Restore failed."); }
    finally { setBusy(false); }
  }
  async function refresh() {
    setBusy(true); setError(""); setMessage("");
    try {
      setView(await loadSettings(scope, target));
      setMessage(changes.length ? "File reloaded. Your draft is still here; check it against the new values." : "Settings reloaded from disk.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Reload failed."); }
    finally { setBusy(false); }
  }

  const needle = query.trim().toLowerCase();
  const results = fields.filter(field => field.section !== "modelDefaults" && (!needle || (field.label + " " + field.key + " " + field.help).toLowerCase().includes(needle)));
  const shownSections = [...sections.filter(section => results.some(field => field.section === section.id)), ...(scope === "global" && !needle ? [KEYBINDINGS] : [])];
  const [currentGroup, setCurrentGroup] = useCurrentGroup(view ? shownSections.map(section => section.id) : []);
  async function closeRaw(saved: boolean) {
    setRaw(false);
    if (!saved) return;
    setDraft({});
    setError("");
    setLoading(true);
    try { setView(await loadSettings(scope, target)); setMessage("Saved settings.json. Applies to new T3Code threads, or after /reload."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Reload failed."); }
    finally { setLoading(false); }
  }
  const openRaw = () => { setRaw(true); setMessage(""); };
  const row = (field: Field) => {
    if (!view) return null;
    const edit = draft[field.key];
    const overridden = edit ? "value" in edit : Object.hasOwn(view.values, field.key);
    const value = edit ? "value" in edit ? edit.value : view.inherited[field.key] : view.values[field.key] ?? view.inherited[field.key];
    return <SettingField key={field.key} field={field} value={value} inherited={view.inherited[field.key]} overridden={overridden} scope={scope} project={project}
      disabled={scope === "project" && !!field.globalOnly}
      invalid={invalidKeys.includes(field.key) || (!edit && view.invalid.includes(field.key))}
      onChange={value => change(field.key, value)} onReset={() => reset(field.key)} />;
  };
  const rows = (list: Field[]) => <FieldGroup>{list.map((field, index) => <Fragment key={field.key}>{index > 0 && <FieldSeparator />}{row(field)}</Fragment>)}</FieldGroup>;
  const description = scope === "project" ? "Settings for this project only. They override the global ones while the project is trusted." : "Pi core settings shared by every project.";
  if (raw) return <>
    <PageHeader title="General" description={description} />
    <RawJsonEditor file="settings.json" load={loadRaw} save={saveRaw} onClose={saved => void closeRaw(saved)} />
  </>;
  return <>
    <PageHeader title="General" titleRef={title} description={description} files={[view?.path]} actions={<>
      <SearchField label="Search settings" placeholder="Search settings or keys…" value={query} onChange={setQuery} className="w-72 max-sm:w-auto max-sm:min-w-0 max-sm:flex-1" />
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}><FileJson aria-hidden="true" data-icon="inline-start" />File<ChevronDown aria-hidden="true" data-icon="inline-end" /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto">
          <DropdownMenuGroup>
            <DropdownMenuItem disabled={busy || !!changes.length} onClick={openRaw}><FileJson aria-hidden="true" />Edit as JSON</DropdownMenuItem>
            <DropdownMenuItem disabled={busy} onClick={() => void refresh()}><RotateCcw aria-hidden="true" />Reload from disk</DropdownMenuItem>
          </DropdownMenuGroup>
          {view?.hasBackup && <><DropdownMenuSeparator /><DropdownMenuGroup><DropdownMenuItem disabled={busy || !!changes.length} onClick={() => setRestore(true)}><History aria-hidden="true" />Restore previous file</DropdownMenuItem></DropdownMenuGroup></>}
        </DropdownMenuContent>
      </DropdownMenu>
    </>} />
    {project && <ScopeChoice className="mb-5" value={scope} globalLabel="Global settings" disabled={busy || !!changes.length} onChange={setScopeChoice} />}
    {scope === "global" && !needle && <PiPanel />}
    <Feedback message={message} onDismiss={() => setMessage("")} />
    {error && <Alert variant="destructive" className="mb-4"><CircleAlert aria-hidden="true" /><AlertTitle>Could not complete the operation</AlertTitle><AlertDescription>{error}</AlertDescription>
      <div className="actions col-start-2 mt-2"><Button variant="outline" size="sm" disabled={busy} onClick={() => void refresh()}>Reload settings</Button>
        <Button variant="outline" size="sm" disabled={busy || !!changes.length} onClick={openRaw}>Edit as JSON</Button></div></Alert>}
    {loading ? <div className="loading" aria-busy="true"><Spinner />Reading settings…</div> : view && <div className="settings-layout">
        <nav className="section-nav" aria-label="Setting groups">{shownSections.map(section => {
          // What the reader has made of each group: a dot for unsaved edits, else how many keys the file sets.
          const keys = fields.filter(field => field.section === section.id).map(field => field.key);
          const unsaved = changes.some(change => keys.includes(change.key));
          const set = keys.filter(key => Object.hasOwn(view.values, key)).length;
          // A link that looks like a button: shadcn's buttonVariants on a plain <a> keeps the link role.
          return <a key={section.id} href={"#group-" + section.id} aria-current={section.id === currentGroup ? "true" : undefined}
            className={cn(buttonVariants({ variant: section.id === currentGroup ? "secondary" : "ghost", size: "sm" }), "justify-between")}
            onClick={event => { event.preventDefault(); setCurrentGroup(section.id); document.getElementById("group-" + section.id)?.scrollIntoView({ block: "start" }); }}>
            {section.title}
            {unsaved ? <span className="nav-dot"><span className="sr-only">(unsaved changes)</span></span>
              : set > 0 && <span className="nav-count"><span aria-hidden="true">{set}</span><span className="sr-only">({set} set)</span></span>}
          </a>;
        })}</nav>
        <div className="settings-content">
          <div>
            {sections.map(group => {
              const items = results.filter(field => field.section === group.id);
              // A search shows every match; otherwise the advanced rows wait behind the group's toggle,
              // which starts open when the file sets one of them.
              const advanced = needle ? [] : items.filter(field => field.advanced);
              return items.length > 0 && <section key={group.id} id={"group-" + group.id} className="settings-group" aria-labelledby={"group-" + group.id + "-title"}>
                <h2 id={"group-" + group.id + "-title"}>{group.title}</h2>
                {"note" in group && <Alert role="note"><AlertDescription>{group.note}</AlertDescription></Alert>}
                {rows(items.filter(field => !advanced.includes(field)))}
                {advanced.length > 0 && <><Separator className="mt-4 mb-2" /><Disclosure label={`${advanced.length} advanced ${advanced.length === 1 ? "setting" : "settings"}`} hiddenUntilFound
                  open={advancedOpen[group.id] ?? advanced.some(field => Object.hasOwn(view.values, field.key))}
                  onOpenChange={open => setAdvancedOpen(current => ({ ...current, [group.id]: open }))}>
                  {rows(advanced)}
                </Disclosure></>}
              </section>;
            })}
            {!results.length && <Empty><EmptyHeader><EmptyDescription>No settings match “{query.trim()}”. Try a label such as “model” or “budget”, or a key.</EmptyDescription></EmptyHeader></Empty>}
            {changes.length > 0 && <div className="save-bar" role="region" aria-label="Unsaved changes">
              <p>{changes.length} unsaved {changes.length === 1 ? "change" : "changes"}</p>
              <div className="actions">
                <Button variant="outline" disabled={busy} onClick={() => { setDraft({}); setError(""); setMessage("Draft discarded. No file was changed."); }}>Discard</Button>
                <Button disabled={busy} onClick={() => void save()}>{busy && <Spinner data-icon="inline-start" aria-hidden="true" />}{busy ? "Saving…" : "Save"}</Button>
              </div>
            </div>}
          </div>
          {scope === "global" && !needle && <KeybindingsPanel onMessage={setMessage} />}
          {scope === "global" && !needle && <NotHere />}
          <p className="scope-footnote">Saved values apply to new T3Code threads, or after /reload. Unknown keys in the file are kept as they are.</p>
        </div>
      </div>}
    <AlertDialog open={restore} onOpenChange={setRestore}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restore previous file?</AlertDialogTitle>
          <AlertDialogDescription>This replaces the whole file with its latest backup, including settings this page does not display. The current file becomes the next backup.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          {/* Closes first, so a failure shows on the page rather than behind the dialog. */}
          <AlertDialogAction disabled={busy} onClick={() => { setRestore(false); void recover(); }}>Restore previous file</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <datalist id="model-ids">{modelIds.map(id => <option key={id} value={id} />)}</datalist>
  </>;
}
