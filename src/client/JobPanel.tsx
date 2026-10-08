import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { JobView } from "../shared/jobs";
import { answerJob, cancelJob, loadJob, startJob } from "./api";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "./components/ui/field";
import { Input } from "./components/ui/input";
import { RadioGroup, RadioGroupItem } from "./components/ui/radio-group";
import { Disclosure } from "./Disclosure";

/** Start a job on click and follow it until it ends. */
export function useJob(onFinish?: (job: JobView) => void) {
  const [job, setJob] = useState<JobView>();
  const [error, setError] = useState("");
  const finished = useRef(onFinish);
  finished.current = onFinish;
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
    try { setJob(await startJob(body)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start."); }
  }
  const act = (change: (job: JobView) => Promise<JobView>) => job && change(job).then(setJob).catch(cause => setError(cause instanceof Error ? cause.message : "Failed."));
  return {
    job, error, start, running: job?.status === "running",
    answer: (value: string) => act(current => answerJob(current.id, current.prompt!.id, value)),
    cancel: () => act(current => cancelJob(current.id)),
    dismiss: () => { setJob(undefined); setError(""); },
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
  return <section className="job" data-status={job.status} aria-label={job.title} aria-busy={job.status === "running"}>
    <div className="job-header"><strong>{job.title}</strong><span role="status">{statusText[job.status]}{job.exitCode !== undefined && job.status === "failed" ? ` (exit ${job.exitCode})` : ""}</span></div>
    {job.events.map((event, index) => event.type === "link"
      ? <p key={index}><a href={event.url} target="_blank" rel="noreferrer noopener">{event.label}</a></p>
      : event.type === "code" ? <p key={index}>Enter <Badge variant="outline" render={<code />}>{event.code}</Badge> at <a href={event.url} target="_blank" rel="noreferrer noopener">{event.url}</a></p>
      : <p key={index} className="muted">{event.message}</p>)}
    {job.prompt && <PromptForm key={job.prompt.id} job={job} onAnswer={onAnswer} />}
    {children}
    {(job.error || error) && <FieldError>{job.error || error}</FieldError>}
    {/* Output opens by itself when the job fails; the key starts it over at each change of status. */}
    {job.output && <Disclosure key={job.status} label="Output" defaultOpen={job.status === "failed"}><pre>{job.output}</pre></Disclosure>}
    <div className="actions">{job.status === "running"
      ? <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
      : <Button variant="ghost" size="sm" onClick={onDismiss}>Dismiss</Button>}</div>
  </section>;
}
