"use client";
import { FiCpu } from "react-icons/fi";
import type { AgentMemory } from "@/lib/api";
import { TabHeader, Spinner } from "./shared";

// ── Agent Memory tab (read-only) ────────────────────────────────────────────────

const LESSON_STYLE: Record<string, { label: string; cls: string }> = {
  worked:  { label: "What worked",   cls: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  didnt:   { label: "What fell short", cls: "border-rose-200 bg-rose-50 text-rose-800" },
  improve: { label: "Improve next time", cls: "border-amber-200 bg-amber-50 text-amber-800" },
};

function AgentMemoryTab({
  data, loading, fetchedAt, onRefresh,
}: {
  data: AgentMemory[];
  loading: boolean;
  fetchedAt: Date | null;
  onRefresh: () => void;
}) {
  const fmtCost = (v?: number) => (typeof v === "number" ? `$${v.toFixed(3)}` : "—");
  const fmt = (v?: number) => (typeof v === "number" ? v.toLocaleString() : "—");

  return (
    <div className="space-y-3">
      <TabHeader count={data.length} label="agents" fetchedAt={fetchedAt} loading={loading} onRefresh={onRefresh} />
      <p className="text-sm text-slate-500">
        Read-only. Each agent learns from its own past runs — what worked, what fell short, and how to do better next
        time for both quality and cost. The generator folds its <span className="font-medium">Improve next time</span> hints
        back into its prompt so first drafts pre-empt known weaknesses and need fewer (cheaper) refine cycles.
      </p>

      {loading && !data.length ? <Spinner text="Loading agent memory…" /> : (
        <div className="space-y-4">
          {data.map(a => (
            <div key={a.agent} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <FiCpu className="w-4 h-4 text-brand-500" />
                    <h3 className="font-semibold text-slate-900 capitalize">{a.agent}</h3>
                    <span className="text-xs text-slate-400">{a.stats.runs} run{a.stats.runs === 1 ? "" : "s"}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{a.description}</p>
                </div>
                {/* Stat chips */}
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {a.stats.avg_first_score !== undefined && (
                    <span className="rounded bg-slate-100 text-slate-700 px-2 py-0.5">First draft {a.stats.avg_first_score}</span>
                  )}
                  {a.stats.avg_cycles !== undefined && (
                    <span className="rounded bg-slate-100 text-slate-700 px-2 py-0.5">{a.stats.avg_cycles} cycles avg</span>
                  )}
                  {a.stats.pass_rate_pct !== undefined && (
                    <span className="rounded bg-slate-100 text-slate-700 px-2 py-0.5">{a.stats.pass_rate_pct}% pass</span>
                  )}
                  {a.stats.avg_cost_usd !== undefined && (
                    <span className="rounded bg-slate-100 text-slate-700 px-2 py-0.5">{fmtCost(a.stats.avg_cost_usd)}/run</span>
                  )}
                  {a.stats.avg_score !== undefined && (
                    <span className="rounded bg-slate-100 text-slate-700 px-2 py-0.5">avg score {a.stats.avg_score}</span>
                  )}
                </div>
              </div>

              {a.stats.runs === 0 ? (
                <p className="text-xs text-slate-400 mt-3 italic">No runs recorded yet — lessons appear once this agent has done some work.</p>
              ) : (
                <>
                  {a.weaknesses.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-slate-500">Recurring weaknesses:</span>
                      {a.weaknesses.slice(0, 5).map(([w, n]) => (
                        <span key={w} className="text-xs rounded bg-rose-50 text-rose-700 border border-rose-100 px-1.5 py-0.5">{w} · {fmt(n)}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 space-y-2">
                    {a.lessons.map((l, i) => {
                      const s = LESSON_STYLE[l.kind] ?? LESSON_STYLE.worked;
                      return (
                        <div key={i} className={`rounded-lg border px-3 py-2 text-xs ${s.cls}`}>
                          <span className="font-semibold">{s.label}: </span>{l.text}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ))}
          {!data.length && (
            <div className="rounded-xl border border-slate-200 px-4 py-10 text-center text-slate-400">No agent memory yet.</div>
          )}
        </div>
      )}
    </div>
  );
}

export default AgentMemoryTab;
