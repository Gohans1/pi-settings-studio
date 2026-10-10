import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { BellRing, ChevronDown, CircleAlert, FileJson, History, Image, Info, Keyboard, Lock, MessagesSquare, Monitor, Network, RotateCcw,
  SearchX, SquareTerminal, Wrench, type LucideIcon } from "lucide-react";
import { fields, isPiDefault, sections, type SettingsView } from "../shared/settings";
import { loadAvailableModels, loadPi, loadRawSettings, loadSettings, restoreSettings, saveRawSettings, saveSettings } from "./api";
import { focusSetting, SaveBar, useSettingDraft } from "./SettingsForm";
import { modelSuggestions, type Suggestion } from "./SuggestInput";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./components/ui/alert-dialog";
import { Button } from "./components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./components/ui/dropdown-menu";
import { ItemGroup } from "./components/ui/item";
import { Separator } from "./components/ui/separator";
import { Feedback } from "./Feedback";
import { PageHeader } from "./PageHeader";
import { PiPanel } from "./PiPanel";
import { NotHere } from "./NotHere";
import { RawJsonEditor } from "./RawJsonEditor";
import { KeybindingsPanel } from "./KeybindingsPanel";
import { SearchField } from "./SearchField";
import { ScopeChoice } from "./ScopeChoice";
import { EmptyDetail, ListItem, Workbench } from "./Workbench";
import { Spinner } from "./components/ui/spinner";

// Entries pinned around the groups: the installed Pi above them; shortcuts and what is not editable below.
const PI = "pi", KEYBINDINGS = "keybindings", ELSEWHERE = "elsewhere";
const icons: Record<string, LucideIcon> = { tools: Wrench, interaction: MessagesSquare, context: History, shell: SquareTerminal,
  images: Image, updates: BellRing, network: Network, terminal: Monitor };
const fieldOf = (key: string) => fields.find(field => field.key === key)!;
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function GeneralTab({ project }: { project?: string }) {
  // The project's own .pi/settings.json overrides the global file key by key.
  const [scopeChoice, setScopeChoice] = useState<"global" | "project">("global");
  const scope = project ? scopeChoice : "global";
  const target = scope === "project" ? project : undefined;
  const loadRaw = useCallback(() => loadRawSettings(scope, target), [scope, target]);
  const saveRaw = useCallback((revision: string, text: string) => saveRawSettings(revision, text, scope, target), [scope, target]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<SettingsView>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [restore, setRestore] = useState(false);
  const [raw, setRaw] = useState(false);
  const [models, setModels] = useState<Suggestion[]>([]);
  const [pi, setPi] = useState<string>();
  // The chosen entry of the list; on a narrow screen, open shows it in place of the list.
  // A link to #general/<group> opens on that group.
  const linked = sections.find(section => section.id === location.hash.split("/")[1])?.id;
  const [pane, setPane] = useState<string>(linked ?? sections[0].id);
  const [open, setOpen] = useState(!!linked);
  useEffect(() => { loadAvailableModels(project).then(found => setModels(modelSuggestions(found))).catch(() => setModels([])); }, [project]);
  useEffect(() => { loadPi().then(found => setPi(found.installed)).catch(() => setPi(undefined)); }, []);
  const title = useRef<HTMLHeadingElement>(null);
  const { changes, invalidKeys, unsaved, valueOf, rows, discard } = useSettingDraft(view, { project, models, onEdit: () => setMessage("") });

  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setMessage(""); setView(undefined);
    discard();
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

  async function save() {
    if (!view) return;
    // Pi would refuse the file: take the reader to the first value to fix, and write nothing.
    if (invalidKeys.length) {
      // It may sit in another group, or outside the search: show its group first.
      const field = fieldOf(invalidKeys[0]!);
      flushSync(() => { setQuery(""); setPane(field.section); setOpen(true); });
      focusSetting(field.key);
      return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      setView(await saveSettings(scope, view.revision, changes, target));
      discard(); setMessage("Saved to file. Reload Pi or start a new session to apply supported settings.");
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
  const results = fields.filter(field => sections.some(section => section.id === field.section) && (!needle || (field.label + " " + field.key + " " + field.help).toLowerCase().includes(needle)));
  const groups = sections.filter(section => results.some(field => field.section === section.id));
  // Pi, the shortcuts and what is not editable here belong to the global page, and step aside for a search.
  const pinned = scope === "global" && !needle;
  const current = (pinned && [PI, KEYBINDINGS, ELSEWHERE].includes(pane)) || groups.some(group => group.id === pane) ? pane : groups[0]?.id;
  async function closeRaw(saved: boolean) {
    setRaw(false);
    if (!saved) return;
    discard();
    setError("");
    setLoading(true);
    try { setView(await loadSettings(scope, target)); setMessage("Saved settings.json. Applies to new Pi sessions, or after /reload."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Reload failed."); }
    finally { setLoading(false); }
  }
  const openRaw = () => { setRaw(true); setMessage(""); };
  // What a group's row in the list says: matches while searching, else unsaved edits, else what differs.
  const groupState = (id: string): ReactNode => {
    const own = results.filter(field => field.section === id);
    if (needle) return own.length;
    if (own.some(field => unsaved(field.key))) return <><span className="nav-dot" aria-hidden="true" />unsaved</>;
    const differ = view ? own.filter(field => scope === "project" ? Object.hasOwn(view.values, field.key) : !isPiDefault(field, view.values[field.key])).length : 0;
    return differ ? `${differ} ${scope === "project" ? "set" : "custom"}` : undefined;
  };
  const entry = (id: string, icon: LucideIcon | undefined, name: string, state?: ReactNode) => <div key={id} role="listitem" className="list-row">
    <ListItem selected={current === id} onSelect={() => { setPane(id); setOpen(true); }} icon={icon} name={name} state={state} />
  </div>;
  const list = <section aria-label="Setting groups">
    <div className="list-search"><SearchField label="Search settings" placeholder="Search settings or keys…" value={query} onChange={setQuery} /></div>
    {pinned && <><ItemGroup>{entry(PI, Info, "Pi", pi)}</ItemGroup><Separator className="mt-2" /></>}
    <ItemGroup className="mt-2">{groups.map(group => entry(group.id, icons[group.id], group.title, groupState(group.id)))}</ItemGroup>
    {pinned && <><Separator className="mt-2" /><ItemGroup className="mt-2">
      {entry(KEYBINDINGS, Keyboard, "Keyboard shortcuts", "terminal")}{entry(ELSEWHERE, Lock, "Not editable here")}
    </ItemGroup></>}
  </section>;

  const group = sections.find(section => section.id === current);
  let detail: ReactNode;
  if (current === PI) detail = <><header className="detail-header"><h2>Pi</h2></header><PiPanel /></>;
  else if (current === KEYBINDINGS) detail = <KeybindingsPanel onMessage={setMessage} />;
  else if (current === ELSEWHERE) detail = <NotHere />;
  else if (group && view) {
    const own = results.filter(field => field.section === group.id);
    const everyday = own.filter(field => !field.advanced), advanced = own.filter(field => field.advanced);
    const differ = own.filter(field => scope === "project" ? Object.hasOwn(view.values, field.key) : !isPiDefault(field, valueOf(field.key))).length;
    detail = <section className="settings-group" aria-labelledby="group-title">
      <header className="detail-header"><div>
        <h2 id="group-title">{group.title}</h2>
        <p className="muted">{needle ? count(own.length, "matching setting", "matching settings")
          : `${count(own.length, "setting", "settings")} · ${scope === "project" ? (differ ? `${differ} set in this project` : "all inherited") : (differ ? `${differ} custom` : "all at Pi's default")}`}</p>
      </div></header>
      {"note" in group && <Alert role="note"><AlertDescription>{group.note}</AlertDescription></Alert>}
      {everyday.length > 0 && rows(everyday)}
      {advanced.length > 0 && <section className="settings-part" data-first={!everyday.length || undefined} aria-labelledby="advanced-title">
        <header><h3 id="advanced-title">Advanced</h3><p className="muted">Tuning most people never change.</p></header>
        {rows(advanced)}
      </section>}
      <p className="scope-footnote">Saved values apply to new Pi sessions, or after /reload. Unknown keys in the file are kept as they are.</p>
    </section>;
  }

  const description = scope === "project" ? "Settings for this project only. They override the global ones while the project is trusted." : "Pi core settings shared by every project.";
  if (raw) return <>
    <PageHeader title="General" description={description} />
    <RawJsonEditor file="settings.json" load={loadRaw} save={saveRaw} onClose={saved => void closeRaw(saved)} />
  </>;
  return <>
    <PageHeader title="General" titleRef={title} description={description} files={[view?.path]} actions={<DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}><FileJson aria-hidden="true" data-icon="inline-start" />File<ChevronDown aria-hidden="true" data-icon="inline-end" /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto">
        <DropdownMenuGroup>
          <DropdownMenuItem disabled={busy || !!changes.length} onClick={openRaw}><FileJson aria-hidden="true" />Edit as JSON</DropdownMenuItem>
          <DropdownMenuItem disabled={busy} onClick={() => void refresh()}><RotateCcw aria-hidden="true" />Reload from disk</DropdownMenuItem>
        </DropdownMenuGroup>
        {view?.hasBackup && <><DropdownMenuSeparator /><DropdownMenuGroup><DropdownMenuItem disabled={busy || !!changes.length} onClick={() => setRestore(true)}><History aria-hidden="true" />Restore previous file</DropdownMenuItem></DropdownMenuGroup></>}
      </DropdownMenuContent>
    </DropdownMenu>} />
    {project && <ScopeChoice className="mb-5" value={scope} globalLabel="Global settings" disabled={busy || !!changes.length} onChange={setScopeChoice} />}
    <Feedback message={message} onDismiss={() => setMessage("")} />
    {error && <Alert variant="destructive" className="mb-4"><CircleAlert aria-hidden="true" /><AlertTitle>Could not complete the operation</AlertTitle><AlertDescription>{error}</AlertDescription>
      <div className="actions col-start-2 mt-2"><Button variant="outline" size="sm" disabled={busy} onClick={() => void refresh()}>Reload settings</Button>
        <Button variant="outline" size="sm" disabled={busy || !!changes.length} onClick={openRaw}>Edit as JSON</Button></div></Alert>}
    {loading ? <div className="loading" aria-busy="true"><Spinner />Reading settings…</div> : view && <Workbench open={open} onBack={() => setOpen(false)} backLabel="All groups" list={list}
      detail={current ? <div className="detail">
        {detail}
        {changes.length > 0 && <SaveBar count={changes.length} busy={busy} onSave={() => void save()}
          onDiscard={() => { discard(); setError(""); setMessage("Draft discarded. No file was changed."); }} />}
      </div> : <EmptyDetail icon={SearchX} title="No settings match">Try a label such as “model” or “budget”, or a key.</EmptyDetail>} />}
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
  </>;
}
