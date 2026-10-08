import { useEffect, useState } from "react";
import { CircleCheck, Folder, TriangleAlert } from "lucide-react";
import type { ProjectView, TrustView } from "../shared/projects";
import { loadProjects, saveTrust } from "./api";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { FieldError } from "./components/ui/field";
import { Label } from "./components/ui/label";
import { OptionSelect } from "./OptionSelect";
import { home } from "./PageHeader";

const STORAGE_KEY = "pi-settings:project";

/** The chosen project, remembered across visits; undefined until the list is known. */
export function useProject() {
  const [projects, setProjects] = useState<ProjectView[]>();
  const [project, setProject] = useState<string | undefined>(() => localStorage.getItem(STORAGE_KEY) ?? undefined);
  useEffect(() => { loadProjects().then(setProjects).catch(() => setProjects([])); }, []);
  function choose(path: string | undefined) {
    if (path) localStorage.setItem(STORAGE_KEY, path); else localStorage.removeItem(STORAGE_KEY);
    setProject(path);
  }
  function updateTrust(path: string, trust: TrustView) {
    setProjects(current => current?.map(entry => entry.path === path ? { ...entry, trust } : entry));
  }
  const known = projects?.some(entry => entry.path === project) ? project : undefined;
  return { projects, project: known, choose, updateTrust };
}

export function ProjectPicker({ projects, project, onChoose }: { projects?: ProjectView[]; project?: string; onChoose: (path?: string) => void }) {
  const options = [{ value: "", label: "None (global only)" }, ...(projects ?? []).map(entry => ({ value: entry.path, label: home(entry.path) }))];
  return <div className="project-picker"><Folder aria-hidden="true" /><Label htmlFor="project-picker">Project</Label>
    <OptionSelect id="project-picker" className="w-72 max-sm:w-auto" options={options} value={project ?? ""} disabled={!projects} onChange={path => onChoose(path || undefined)} />
  </div>;
}

export function TrustPanel({ project, trust, onChange }: { project: string; trust: TrustView; onChange: (trust: TrustView) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function decide(decision: boolean | null) {
    setBusy(true); setError("");
    try { onChange(await saveTrust(project, decision)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the trust decision."); }
    finally { setBusy(false); }
  }
  const why = trust.decision !== undefined
    ? `${trust.decision ? "Trusted" : "Not trusted"} in Pi's trust.json${trust.savedFor && trust.savedFor !== project ? ` through ${home(trust.savedFor)}` : ""}`
    : `No saved decision; defaultProjectTrust is "${trust.defaultTrust}"`;
  // A landmark rather than an alert: it states the chosen project's trust, it does not interrupt.
  return <Alert role="region" aria-label="Project trust" className="mb-5">
    {trust.loadsInT3Code ? <CircleCheck aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}
    <AlertTitle>{trust.loadsInT3Code ? "This project's .pi folder loads in T3Code." : "T3Code ignores this project's .pi folder."}</AlertTitle>
    <AlertDescription>{why}.{!trust.loadsInT3Code && " T3Code cannot ask for trust, so project settings, MCP servers and resources stay unused until the project is trusted."}</AlertDescription>
    <div className="actions col-start-2 mt-2">
      {!trust.loadsInT3Code && <Button size="sm" disabled={busy} onClick={() => void decide(true)}>Trust this project</Button>}
      {trust.decision !== false && <Button size="sm" variant="outline" disabled={busy} onClick={() => void decide(false)}>Do not trust</Button>}
      {trust.decision !== undefined && trust.savedFor === project && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void decide(null)}>Forget the decision</Button>}
    </div>
    {error && <FieldError className="col-start-2 mt-2">{error}</FieldError>}
  </Alert>;
}
