import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { JobAction, JobInput, JobView } from "../shared/jobs";
import { answerJob, cancelJob, loadJob, loadJobs, startJob } from "./api";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "./components/ui/card";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "./components/ui/field";
import { Input } from "./components/ui/input";
import { RadioGroup, RadioGroupItem } from "./components/ui/radio-group";
import { ScrollArea } from "./components/ui/scroll-area";
import { Disclosure } from "./Disclosure";
import { play } from "./Sound";

/** The jobs a panel shows: these actions, for this provider when given. A job for another project is not shown. */
export type JobScope = { actions: JobAction[]; project?: string; provider?: string };
const inScope = (input: JobInput, scope: JobScope) => scope.actions.includes(input.action)
  && (scope.provider === undefined || input.provider === scope.provider) && (input.project === undefined || input.project === scope.project);

// Jobs this page started or showed, until dismissed: a panel coming back shows them again, finished or not.
const shown = new Set<string>();

/**
 * Start a job on click and follow it until it ends. Jobs run on the server, so a panel that comes back
 * (another tab, a reload) picks up its job that still runs, or one this page showed and was not dismissed.
 */
export function useJob(scope: JobScope, onFinish?: (job: JobView) => void) {
  const [job, setJob] = useState<JobView>();
  const current = useRef(job);
  current.current = job;
  const [error, setError] = useState("");
  const finished = useRef(onFinish);
  finished.current = onFinish;
  // Slow work starts quietly, ends with its outcome, and asks for attention when Pi has a question.
  const heard = useRef<JobView>(undefined);
  useEffect(() => {
    const before = heard.current;
    heard.current = job;
    if (!job) return;
    const fresh = job.id !== before?.id;
    if (job.status === "running") { if (fresh) play("loading", { emphasis: "subtle" }); }
    else if (fresh || before?.status === "running") { if (job.status === "done") play("success"); else if (job.status === "failed") play("error"); }
    if (job.prompt && job.prompt.id !== before?.prompt?.id) play("attention");
  }, [job]);
  const key = JSON.stringify(scope);
  useEffect(() => {
    let active = true;
    loadJobs().then(async list => {
      const found = list.find(entry => inScope(entry.input, scope) && (entry.status === "running" || shown.has(entry.id)));
      if (!found || !active || current.current) return;
      const next = await loadJob(found.id);
      if (!active || current.current) return;
      // Coming back is not a new start or a new outcome: nothing to hear.
      heard.current = next;
      shown.add(next.id);
      setJob(next);
    }).catch(() => { /* the panel starts empty and its button still starts a job */ });
    return () => { active = false; };
  // The scope's JSON is its identity; a new object with the same fields is not a new scope.
  }, [key]);
  useEffect(() => {
    if (!job || job.status !== "running") return;
    const timer = setTimeout(() => {
      loadJob(job.id).then(next => { setJob(next); if (next.status !== "running") finished.current?.(next); })
        .catch(cause => setError(cause instanceof Error ? cause.message : "Lost track of the job."));
    }, 700);
    return () => clearTimeout(timer);
  }, [job]);
  async function start(body: Record<string, unknown>) {
    setError("");
    try { const started = await startJob(body); shown.add(started.id); setJob(started); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start."); }
  }
  const act = (change: (job: JobView) => Promise<JobView>) => job && change(job).then(setJob).catch(cause => setError(cause instanceof Error ? cause.message : "Failed."));
  return {
    job, error, start, running: job?.status === "running",
    answer: (value: string) => act(current => answerJob(current.id, current.prompt!.id, value)),
    cancel: () => act(current => cancelJob(current.id)),
    dismiss: () => { if (job) shown.delete(job.id); setJob(undefined); setError(""); },
  };
}

const statusText = { running: "Running…", done: "Finished", failed: "Failed", cancelled: "Cancelled" };

function PromptForm({ job, onAnswer }: { job: JobView; onAnswer: (value: string) => void }) {
  const prompt = job.prompt!;
  const [value, setValue] = useState(prompt.type === "select" ? prompt.options?.[0]?.id ?? "" : "");
  function submit(event: FormEvent) { event.preventDefault(); onAnswer(value); }
  const id = `prompt-${job.id}-${prompt.id}`;
  return <form className="job-prompt" onSubmit={submit}>
    {prompt.type === "select" ? <FieldSet>
      <FieldLegend id={id + "-legend"} variant="label">{prompt.message}</FieldLegend>
      <RadioGroup aria-labelledby={id + "-legend"} value={value} onValueChange={next => setValue(String(next))}>
        {prompt.options?.map(option => <Field key={option.id} orientation="horizontal">
          <RadioGroupItem id={`${id}-${option.id}`} value={option.id} />
          <FieldContent><FieldLabel htmlFor={`${id}-${option.id}`}>{option.label}</FieldLabel>
            {option.description && <FieldDescription>{option.description}</FieldDescription>}</FieldContent>
        </Field>)}
      </RadioGroup>
    </FieldSet> : <Field>
      <FieldLabel htmlFor={id}>{prompt.message}</FieldLabel>
      <Input id={id} type={prompt.type === "secret" ? "password" : "text"} value={value} placeholder={prompt.placeholder}
        autoComplete="off" spellCheck={false} onChange={event => setValue(event.target.value)} />
    </Field>}
    <div className="actions"><Button type="submit" disabled={!value}>Continue</Button></div>
  </form>;
}

export function JobPanel({ job, error, onAnswer, onCancel, onDismiss, children }: {
  job?: JobView; error?: string; onAnswer: (value: string) => void; onCancel: () => void; onDismiss: () => void; children?: ReactNode;
}) {
  if (!job) return error ? <Alert variant="destructive"><AlertTitle>Could not start</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null;
  return <Card size="sm" role="region" aria-label={job.title} aria-busy={job.status === "running"}>
    <CardHeader>
      <CardTitle>{job.title}</CardTitle>
      <CardAction><Badge role="status" variant={job.status === "failed" ? "destructive" : "secondary"}>{statusText[job.status]}{job.exitCode !== undefined && job.status === "failed" ? ` (exit ${job.exitCode})` : ""}</Badge></CardAction>
    </CardHeader>
    <CardContent><div className="job-body">
    {job.events.map((event, index) => event.type === "link"
      ? <p key={index}><a href={event.url} target="_blank" rel="noreferrer noopener">{event.label}</a></p>
      : event.type === "code" ? <p key={index}>Enter <Badge variant="outline" render={<code />}>{event.code}</Badge> at <a href={event.url} target="_blank" rel="noreferrer noopener">{event.url}</a></p>
      : <p key={index} className="muted">{event.message}</p>)}
    {job.prompt && <PromptForm key={job.prompt.id} job={job} onAnswer={onAnswer} />}
    {children}
    {(job.error || error) && <FieldError>{job.error || error}</FieldError>}
    {/* Output opens by itself when the job fails; the key starts it over at each change of status. */}
    {job.output && <Disclosure key={job.status} label="Output" defaultOpen={job.status === "failed"}><ScrollArea className="flex max-h-80 flex-col"><pre>{job.output}</pre></ScrollArea></Disclosure>}
    </div></CardContent>
    <CardFooter>{job.status === "running"
      ? <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
      : <Button variant="ghost" size="sm" onClick={onDismiss}>Dismiss</Button>}</CardFooter>
  </Card>;
}
