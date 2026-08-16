"use client";

// Admin — Agent Runs viewer. Lists recent graph+loop runs (GET /api/graph/runs)
// and renders the selected run's orchestration with the shared AgentGraph.

import { useEffect, useState } from "react";
import AgentGraph from "@/components/AgentGraph";
import { getGraphRun, listGraphRuns, type GraphRun } from "@/lib/api/graph";

type RunRow = Pick<GraphRun, "run_id" | "kind" | "status" | "model" | "created_at" | "totals">;

export default function GraphRunsTab() {
  const [rows, setRows] = useState<RunRow[]>([]);
  const [kind, setKind] = useState<"" | "cv_score" | "cv_build">("");
  const [selected, setSelected] = useState<GraphRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows((await listGraphRuns(kind || undefined, 40)) as unknown as RunRow[]);
    } catch {
      setError("Could not load runs (superadmin only).");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [kind]);

  const open = async (id: string) => {
    try { setSelected(await getGraphRun(id)); } catch { /* ignore */ }
  };

  const score = (r: RunRow | GraphRun) =>
    (r as GraphRun).result && typeof (r as GraphRun).result === "object"
      ? ((r as GraphRun).result as { overall_score?: number }).overall_score : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-sm dark:border-slate-600">
          {([["", "All"], ["cv_score", "CV Score"], ["cv_build", "CV Build"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setKind(k)}
              className={`px-3 py-1.5 ${kind === k ? "bg-teal-500 text-white" : "bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{l}</button>
          ))}
        </div>
        <button onClick={load} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600">Refresh</button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,360px),1fr]">
        <div className="max-h-[560px] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
          {loading ? <p className="p-4 text-sm text-slate-500">Loading…</p> :
            rows.length === 0 ? <p className="p-4 text-sm text-slate-500">No runs yet. Start one at /graph.</p> :
              rows.map((r) => (
                <button key={r.run_id} onClick={() => open(r.run_id)}
                  className={`flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${selected?.run_id === r.run_id ? "bg-teal-50 dark:bg-teal-900/20" : ""}`}>
                  <div className="min-w-0">
                    <div className="font-medium">{r.kind === "cv_score" ? "CV Score" : "CV Build"}</div>
                    <div className="truncate text-[11px] text-slate-400">{new Date(r.created_at).toLocaleString()} · {r.model.split("/").pop()}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {score(r) != null && <span className="rounded bg-amber-100 px-1.5 text-[11px] font-bold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">{Math.round(score(r)!)}</span>}
                    <StatusDot status={r.status} />
                  </div>
                </button>
              ))}
        </div>

        <div>
          {selected ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <StatusDot status={selected.status} />
                <span className="capitalize">{selected.status}</span>
                <span className="opacity-60">· {selected.kind}</span>
                <span className="opacity-60">· tier {selected.tier}</span>
                <span className="opacity-60">· {selected.model}</span>
                {score(selected) != null && <span className="font-semibold text-amber-600">score {Math.round(score(selected)!)}/100</span>}
              </div>
              <AgentGraph run={selected} />
            </div>
          ) : <p className="p-4 text-sm text-slate-500">Select a run to see its agent graph.</p>}
        </div>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const cls = status === "completed" ? "bg-teal-500" : status === "failed" ? "bg-red-500" : "animate-pulse bg-amber-500";
  return <span className={`h-2 w-2 shrink-0 rounded-full ${cls}`} />;
}
