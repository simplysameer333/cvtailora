"use client";

// Live graph+loop run viewer. Paste a resume (+ optional job description), pick
// CV Score or CV Build, and watch the agent graph build in real time — each
// sub-agent node, the fan-out/fan-in dependencies, and the refine loopback.
// Polls GET /api/graph/runs/{id} while the run is in flight.

import { useCallback, useEffect, useRef, useState } from "react";
import AgentGraph from "@/components/AgentGraph";
import {
  getGraphRun,
  startCvBuild,
  startCvScore,
  type GraphRun,
} from "@/lib/api/graph";

type Mode = "cv_score" | "cv_build";

export default function GraphRunPage() {
  const [mode, setMode] = useState<Mode>("cv_score");
  const [resume, setResume] = useState("");
  const [jd, setJd] = useState("");
  const [run, setRun] = useState<GraphRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (poll.current) {
      clearInterval(poll.current);
      poll.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const start = async () => {
    if (!resume.trim()) {
      setError("Paste some resume text first.");
      return;
    }
    setError(null);
    setBusy(true);
    setRun(null);
    stopPolling();
    try {
      const { run_id } =
        mode === "cv_score"
          ? await startCvScore(resume, jd)
          : await startCvBuild({ resume_text: resume, job_description: jd });

      poll.current = setInterval(async () => {
        try {
          const r = await getGraphRun(run_id);
          setRun(r);
          if (r.status === "completed" || r.status === "failed") {
            stopPolling();
            setBusy(false);
          }
        } catch {
          /* transient — keep polling */
        }
      }, 1200);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Failed to start the run.");
      setBusy(false);
    }
  };

  const overall =
    run?.result && typeof run.result === "object"
      ? (run.result as { overall_score?: number }).overall_score
      : undefined;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-6">
      <div>
        <h1 className="text-xl font-bold text-brand-900 dark:text-teal-100">Agent Graph</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Watch each resume section / category run as its own agent, in parallel, then merge into one state.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-600">
          {(["cv_score", "cv_build"] as Mode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-3 py-1.5 text-sm ${mode === m
                ? "bg-teal-500 text-white"
                : "bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
              {m === "cv_score" ? "CV Score" : "CV Build"}
            </button>
          ))}
        </div>
        <button onClick={start} disabled={busy}
          className="rounded-lg bg-brand-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50">
          {busy ? "Running…" : "Run"}
        </button>
        {overall != null && (
          <span className="ml-auto rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-bold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
            Score {Math.round(overall)}/100
          </span>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <textarea value={resume} onChange={(e) => setResume(e.target.value)}
          placeholder="Paste resume text…" rows={5}
          className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-600 dark:bg-slate-800" />
        <textarea value={jd} onChange={(e) => setJd(e.target.value)}
          placeholder="Paste target job description (optional)…" rows={5}
          className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-600 dark:bg-slate-800" />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {run && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <span className={`h-2 w-2 rounded-full ${run.status === "running" || run.status === "pending"
              ? "animate-pulse bg-amber-500" : run.status === "completed" ? "bg-teal-500" : "bg-red-500"}`} />
            <span className="capitalize">{run.status}</span>
            <span className="opacity-60">· {run.model}</span>
          </div>
          <AgentGraph run={run} />
        </div>
      )}
    </div>
  );
}
