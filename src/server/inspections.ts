import { ConfigError } from "./store.ts";

type Run = { stamp: string; started: number; waiting: number; replaced: boolean; controller: AbortController; result: Promise<{ complete: boolean }> };

/**
 * Tool inspections start Pi, every extension and every MCP server, so they are shared and kept, in
 * memory. A request joins the run in progress for the same key and files; one that stops waiting (the
 * reader left the tab) leaves it running, so the result is ready when they come back. Up to `idle` runs
 * nobody waits for keep going, the oldest stopping first; a complete result is kept while what it read
 * is unchanged, for `maxAge` at most.
 */
export class Inspections {
  private readonly kept = new Map<string, { stamp: string; at: number; result: unknown }>();
  private readonly runs = new Map<string, Run>();
  private readonly live = new Set<Run>();
  constructor(private readonly options: { idle?: number; maxAge?: number } = {}) {}

  /** The result for `key` read from files named by `stamp`; `fresh` skips kept and running ones. `signal` ends this caller's wait only. */
  get<T extends { complete: boolean }>(key: string, stamp: string, fresh: boolean, start: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const kept = this.kept.get(key);
    if (!fresh && kept?.stamp === stamp && Date.now() - kept.at < (this.options.maxAge ?? 10 * 60_000)) return Promise.resolve(kept.result as T);
    let run = this.runs.get(key);
    if (run && (fresh || run.stamp !== stamp)) { this.replace(key, run); run = undefined; }
    return this.wait(run ?? this.start(key, stamp, start), signal) as Promise<T>;
  }

  private start(key: string, stamp: string, start: (signal: AbortSignal) => Promise<{ complete: boolean }>): Run {
    const controller = new AbortController();
    const run: Run = { stamp, started: Date.now(), waiting: 0, replaced: false, controller, result: start(controller.signal) };
    this.runs.set(key, run);
    this.live.add(run);
    run.result.then(result => {
      // A replaced run (fresh, or the files changed) does not overwrite the newer one's result.
      if (run.replaced) return;
      this.kept.delete(key);
      // An incomplete result (an extension or server failed) is tried again next time.
      if (!result.complete) return;
      if (this.kept.size >= 30) this.kept.delete(this.kept.keys().next().value!);
      this.kept.set(key, { stamp, at: Date.now(), result });
    }, () => {}).finally(() => {
      this.live.delete(run);
      if (this.runs.get(key) === run) this.runs.delete(key);
    });
    return run;
  }

  private wait(run: Run, signal?: AbortSignal): Promise<unknown> {
    run.waiting++;
    let waiting = true;
    const leave = () => { if (waiting) { waiting = false; run.waiting--; this.trim(); } };
    return new Promise((resolve, reject) => {
      const stop = () => { leave(); reject(new ConfigError("Tool inspection cancelled.", 408)); };
      if (signal?.aborted) return stop();
      signal?.addEventListener("abort", stop, { once: true });
      run.result.then(resolve, reject).finally(() => { signal?.removeEventListener("abort", stop); leave(); });
    });
  }

  private replace(key: string, run: Run) {
    if (this.runs.get(key) === run) this.runs.delete(key);
    run.replaced = true;
    this.trim();
  }

  /** Stops replaced runs nobody waits for, then the oldest idle runs past the limit. */
  private trim() {
    const idle = [...this.live].filter(run => run.waiting === 0);
    for (const run of idle.filter(run => run.replaced)) run.controller.abort();
    const current = idle.filter(run => !run.replaced).sort((a, b) => a.started - b.started);
    for (const run of current.slice(0, Math.max(0, current.length - (this.options.idle ?? 3)))) {
      run.replaced = true;
      for (const [key, value] of this.runs) if (value === run) this.runs.delete(key);
      run.controller.abort();
    }
  }
}
