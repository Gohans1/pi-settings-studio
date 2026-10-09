import { CircleAlert, CircleCheck } from "lucide-react";
import type { ProviderView } from "../shared/models";
import type { JobView } from "../shared/jobs";
import { JobPanel, useJob } from "./JobPanel";
import { Alert, AlertTitle } from "./components/ui/alert";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";

const sources: Record<string, string> = {
  stored: "Stored in auth.json",
  models_json_key: "API key in models.json",
  models_json_command: "Command in models.json",
  environment: "Environment variable",
  runtime: "Runtime key",
  fallback: "Fallback",
};

export function providerState(provider: ProviderView): string {
  if (provider.stored === "oauth") return "signed in";
  if (provider.stored === "api_key") return "API key";
  if (provider.auth.configured) return provider.custom ? "models.json" : "ready";
  return "";
}

const authTypes: Record<string, string> = { api_key: "API key", oauth: "sign-in" };
/** pi auth check's result in words; reasons are Pi's codes made readable. */
function verdict(check: NonNullable<JobView["check"]>): string {
  if (check.status === "ready") return `Pi can use it: ${authTypes[check.authType ?? ""] ?? check.authType ?? "configured"}.`;
  const reason = check.reason ? `: ${check.reason.replaceAll("_", " ")}` : "";
  return check.status === "invalid" ? `Pi finds the credential invalid${reason}.` : `Pi cannot use it yet${reason}.`;
}

/**
 * A provider: where its credential comes from, and Pi's own ways to set one up. Sign-in and key setup both
 * run Pi's login (the same questions as /login), so a provider that needs an account ID or a region asks
 * for it, and Pi writes auth.json itself.
 */
export function ProviderDetail({ provider, busy, onRemove, onChanged, onEndpoint, children }: {
  provider: ProviderView; busy: boolean; onRemove: () => void; onChanged: () => void;
  /** Change where a provider Pi ships sends requests, in models.json. */
  onEndpoint: () => void; children?: React.ReactNode;
}) {
  const login = useJob({ actions: ["provider-login"], provider: provider.id }, job => { if (job.status === "done") onChanged(); });
  // pi auth check: Pi resolves the credential as a session would, environment included.
  const check = useJob({ actions: ["provider-check"], provider: provider.id });
  const setup = useJob({ actions: ["provider-setup"], provider: provider.id }, job => { if (job.status === "done") onChanged(); });
  const keyName = provider.keyName ?? "API key";
  const signedIn = provider.stored === "oauth";
  // Nothing set up yet: the first way in is the view's one filled button.
  const lead = !provider.auth.configured;
  return <section className="detail" aria-labelledby="provider-title" aria-describedby="provider-status">
    <header className="detail-header"><div className="detail-title"><h2 id="provider-title">{provider.name}</h2>
      <Badge id="provider-status" variant={provider.auth.configured ? "outline" : "secondary"}>
        {provider.auth.configured ? <><CircleCheck aria-hidden="true" className="text-success" />{providerState(provider)}</> : providerState(provider) || "not set up"}</Badge></div>
      <div className="actions">
        <Button variant="outline" disabled={check.running} onClick={() => void check.start({ action: "provider-check", provider: provider.id })}>Check credential</Button>
      </div></header>
    <dl className="detail-list">
      <div><dt>ID</dt><dd><code>{provider.id}</code>{provider.custom && <span className="muted"> · {provider.builtIn ? "changed" : "defined"} in models.json</span>}</dd></div>
      {provider.builtIn && <div><dt>Endpoint</dt><dd>{provider.baseUrl ? <code translate="no">{provider.baseUrl}</code> : <span className="muted">Set by the provider</span>}{" "}
        <Button variant="link" size="xs" disabled={busy} onClick={onEndpoint}>{provider.custom ? "Edit in models.json" : "Change in models.json"}</Button></dd></div>}
      <div><dt>Authentication</dt><dd>{provider.auth.configured
        ? <>{sources[provider.auth.source ?? ""] ?? provider.auth.source ?? "Configured"}{signedIn && " (signed in)"}</>
        : <span className="muted">Not in auth.json or models.json. Check credential also looks at the environment of this app.</span>}</dd></div>
      {provider.oauth && <div><dt>Sign-in</dt><dd>{provider.oauth.name}{provider.oauth.subscription ? " (subscription)" : ""}</dd></div>}
    </dl>
    {check.job?.check && <Alert role="status" variant={check.job.check.status === "ready" ? "default" : "destructive"} className="mt-4">
      {check.job.check.status === "ready" ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}<AlertTitle>{verdict(check.job.check)}</AlertTitle></Alert>}
    {check.job && !check.job.check && <JobPanel job={check.job} error={check.error} onAnswer={() => {}} onCancel={() => void check.cancel()} onDismiss={check.dismiss} />}
    {(provider.oauth || provider.keySetup || provider.stored) && <div className="credential">
      <div className="actions">
        {provider.oauth && <Button variant={lead ? "default" : "outline"} disabled={busy || login.running}
          aria-label={`${signedIn ? "Sign in again" : "Sign in"} to ${provider.name}`}
          onClick={() => void login.start({ action: "provider-login", provider: provider.id })}>{signedIn ? "Sign in again" : "Sign in"}</Button>}
        {provider.keySetup && <Button variant={lead && !provider.oauth ? "default" : "outline"} disabled={busy || setup.running}
          onClick={() => void setup.start({ action: "provider-setup", provider: provider.id })}>{provider.stored === "api_key" ? "Replace" : "Set up"} {keyName}</Button>}
        {provider.stored && <Button variant="destructive" disabled={busy} onClick={onRemove}>{signedIn ? "Sign out" : "Remove stored key"}</Button>}
      </div>
      {provider.keySetup && <p className="muted">{signedIn ? `A key replaces the sign-in. ` : ""}Pi asks for it as /login does, then stores it in auth.json.</p>}
    </div>}
    <JobPanel job={login.job} error={login.error} onAnswer={value => void login.answer(value)} onCancel={() => void login.cancel()} onDismiss={login.dismiss} />
    <JobPanel job={setup.job} error={setup.error} onAnswer={value => void setup.answer(value)} onCancel={() => void setup.cancel()} onDismiss={setup.dismiss} />
    {children}
  </section>;
}
