"use client";

// AgentGraph — a flow visualization of a GraphRun's agent orchestration.
// Inspired by Sankey-style "explainer" diagrams (soft curved ribbons between
// labelled stages), rendered in CVTailora's own deep-teal / emerald theme with
// our own data: agent orchestration + graph state. Dependency-free SVG (ribbon
// bands) + an HTML card overlay; theme-aware; scrolls horizontally on its own.

import { useMemo } from "react";
import type { GraphEdge, GraphNode, GraphRun } from "@/lib/api/graph";

const NODE_W = 168;
const NODE_H = 100;
const H_GAP = 116;   // roomy columns so the ribbons breathe
const V_GAP = 30;
const PAD_X = 44;
const PAD_TOP = 52;  // room for stage headers
const PAD_BOT = 44;
const EDGE_INSET = 16; // ribbon endpoints stay inside the node's vertical edges

const RIBBON: Record<string, { grad: string; hw: number; opacity: number }> = {
  sequential: { grad: "g-seq", hw: 4, opacity: 0.5 },
  fanout: { grad: "g-fanout", hw: 5, opacity: 0.55 },
  fanin: { grad: "g-fanin", hw: 5, opacity: 0.55 },
};

// Phase a node belongs to (drives the stage header over its column).
const PHASE_BY_AGENT: Record<string, string> = {
  Analyze: "Analyze",
  SectionOrchestrator: "Orchestrate",
  SectionWorker: "Generate",
  Merge: "Merge",
  EvaluationAgent: "Review",
  CategoryWorker: "Score",
  Aggregate: "Aggregate",
  RefineAgent: "Update",
  VerificationAgent: "Guardrail",
  Prepare: "Prepare",
};

const STATUS_CARD: Record<string, string> = {
  pending: "border-slate-300/70 bg-slate-50 text-slate-500 dark:border-slate-600 dark:bg-slate-800/40 dark:text-slate-400",
  running: "border-amber-400 bg-gradient-to-br from-amber-50 to-amber-100 text-amber-900 shadow-amber-200/50 dark:border-amber-500 dark:from-amber-900/40 dark:to-amber-800/20 dark:text-amber-100",
  completed: "border-teal-500/80 bg-gradient-to-br from-teal-50 to-emerald-50 text-teal-900 dark:border-teal-500/80 dark:from-teal-900/30 dark:to-emerald-900/20 dark:text-teal-50",
  failed: "border-red-500 bg-red-50 text-red-900 dark:border-red-500 dark:bg-red-900/25 dark:text-red-100",
  skipped: "border-slate-300 bg-slate-100 text-slate-400 line-through dark:border-slate-700 dark:bg-slate-800/60",
};

type Pt = { x: number; y: number };

function layout(nodes: GraphNode[], edges: GraphEdge[]) {
  const forward = edges.filter((e) => e.kind !== "loopback" && e.kind !== "spawn");
  const ids = new Set(nodes.map((n) => n.id));
  const preds = new Map<string, string[]>();
  nodes.forEach((n) => preds.set(n.id, []));
  forward.forEach((e) => { if (ids.has(e.source) && ids.has(e.target)) preds.get(e.target)!.push(e.source); });

  const layer = new Map<string, number>();
  const visit = (id: string, seen: Set<string>): number => {
    if (layer.has(id)) return layer.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const ps = preds.get(id) || [];
    const l = ps.length ? Math.max(...ps.map((p) => visit(p, seen))) + 1 : 0;
    layer.set(id, l);
    return l;
  };
  nodes.forEach((n) => visit(n.id, new Set()));

  const byLayer = new Map<number, string[]>();
  nodes.forEach((n) => {
    const l = layer.get(n.id) ?? 0;
    (byLayer.get(l) ?? byLayer.set(l, []).get(l)!).push(n.id);
  });

  const pos = new Map<string, Pt>();
  let rows = 0;
  Array.from(byLayer.keys()).sort((a, b) => a - b).forEach((l) => {
    const col = byLayer.get(l)!;
    rows = Math.max(rows, col.length);
    col.forEach((id, i) => pos.set(id, { x: PAD_X + l * (NODE_W + H_GAP), y: PAD_TOP + i * (NODE_H + V_GAP) }));
  });

  const maxLayer = Math.max(0, ...Array.from(byLayer.keys()));
  const width = PAD_X * 2 + (maxLayer + 1) * NODE_W + maxLayer * H_GAP;
  const height = PAD_TOP + PAD_BOT + rows * NODE_H + Math.max(0, rows - 1) * V_GAP + 46;
  return { pos, width, height, byLayer, layerOf: layer };
}

// Filled ribbon band between two centre endpoints (source right edge → target left edge).
function ribbon(a: Pt, b: Pt, hw: number): string {
  const cx = (a.x + b.x) / 2;
  return (
    `M ${a.x} ${a.y - hw} ` +
    `C ${cx} ${a.y - hw}, ${cx} ${b.y - hw}, ${b.x} ${b.y - hw} ` +
    `L ${b.x} ${b.y + hw} ` +
    `C ${cx} ${b.y + hw}, ${cx} ${a.y + hw}, ${a.x} ${a.y + hw} Z`
  );
}

function loopbackPath(a: Pt, b: Pt): string {
  const sx = a.x + NODE_W / 2, sy = a.y + NODE_H;
  const tx = b.x + NODE_W / 2, ty = b.y + NODE_H;
  const dip = Math.max(sy, ty) + 40;
  return `M ${sx} ${sy} C ${sx} ${dip}, ${tx} ${dip}, ${tx} ${ty}`;
}

const fmtCost = (u: number) => (u >= 0.01 ? `$${u.toFixed(3)}` : u > 0 ? `$${u.toFixed(4)}` : "—");
const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);

export default function AgentGraph({ run }: { run: GraphRun }) {
  const { pos, width, height, byLayer, layerOf } = useMemo(
    () => layout(run.nodes, run.edges), [run.nodes, run.edges]);

  // Distribute ribbon endpoints along each node's edges so fan-out/fan-in spread
  // like a Sankey diagram instead of all meeting at one point.
  const { flow, spawn, loops } = useMemo(() => {
    const forward = run.edges.filter((e) => e.kind === "sequential" || e.kind === "fanout" || e.kind === "fanin");
    const flowPairs = new Set(forward.map((e) => `${e.source}->${e.target}`));
    const spawn = run.edges.filter((e) => e.kind === "spawn" && !flowPairs.has(`${e.source}->${e.target}`));
    const loops = run.edges.filter((e) => e.kind === "loopback");

    const outSlots = new Map<string, string[]>();  // source -> ordered targets
    const inSlots = new Map<string, string[]>();    // target -> ordered sources
    forward.forEach((e) => {
      (outSlots.get(e.source) ?? outSlots.set(e.source, []).get(e.source)!).push(e.target);
      (inSlots.get(e.target) ?? inSlots.set(e.target, []).get(e.target)!).push(e.source);
    });
    const yOrder = (id: string) => pos.get(id)?.y ?? 0;
    outSlots.forEach((arr) => arr.sort((x, y) => yOrder(x) - yOrder(y)));
    inSlots.forEach((arr) => arr.sort((x, y) => yOrder(x) - yOrder(y)));

    const slotY = (nodeTop: number, idx: number, n: number) =>
      nodeTop + EDGE_INSET + ((idx + 0.5) / n) * (NODE_H - 2 * EDGE_INSET);

    const flow = forward.map((e) => {
      const a = pos.get(e.source), b = pos.get(e.target);
      if (!a || !b) return null;
      const outs = outSlots.get(e.source)!, ins = inSlots.get(e.target)!;
      const from: Pt = { x: a.x + NODE_W, y: slotY(a.y, outs.indexOf(e.target), outs.length) };
      const to: Pt = { x: b.x, y: slotY(b.y, ins.indexOf(e.source), ins.length) };
      const running = run.nodes.find((n) => n.id === e.target)?.status === "running";
      return { e, from, to, running };
    }).filter(Boolean) as { e: GraphEdge; from: Pt; to: Pt; running: boolean }[];

    return { flow, spawn, loops };
  }, [run.edges, run.nodes, pos]);

  // Stage header per column (the phase its nodes belong to).
  const headers = useMemo(() => {
    const out: { x: number; label: string }[] = [];
    Array.from(byLayer.keys()).sort((a, b) => a - b).forEach((l) => {
      const ids = byLayer.get(l)!;
      const label = ids.map((id) => {
        const n = run.nodes.find((x) => x.id === id);
        return n ? PHASE_BY_AGENT[n.agent] ?? n.role : "";
      }).find(Boolean) ?? "";
      out.push({ x: PAD_X + l * (NODE_W + H_GAP), label });
    });
    return out;
  }, [byLayer, run.nodes]);

  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/60 p-3 dark:border-slate-700/70 dark:from-slate-900/60 dark:to-slate-900/30">
      <div className="relative" style={{ width, height, minWidth: "100%" }}>
        <svg width={width} height={height} className="absolute inset-0" style={{ pointerEvents: "none" }}>
          <defs>
            <linearGradient id="g-fanout" x1="0" x2="1"><stop offset="0" stopColor="#14b8a6" /><stop offset="1" stopColor="#5eead4" /></linearGradient>
            <linearGradient id="g-fanin" x1="0" x2="1"><stop offset="0" stopColor="#2dd4bf" /><stop offset="1" stopColor="#0f766e" /></linearGradient>
            <linearGradient id="g-seq" x1="0" x2="1"><stop offset="0" stopColor="#94a3b8" /><stop offset="1" stopColor="#64748b" /></linearGradient>
            <marker id="ah-spawn" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#a855f7" /></marker>
            <marker id="ah-loop" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#f59e0b" /></marker>
          </defs>

          {/* faint stage column bands */}
          {headers.map((h, i) => (
            <rect key={`band-${i}`} x={h.x - 12} y={PAD_TOP - 8} width={NODE_W + 24}
              height={height - PAD_TOP - 12} rx={14} className="fill-slate-500/[0.03] dark:fill-slate-300/[0.03]" />
          ))}

          {/* flowing ribbons (fan-out / fan-in / sequential) */}
          {flow.map((f, i) => {
            const spec = RIBBON[f.e.kind] || RIBBON.sequential;
            return (
              <g key={`rib-${i}`}>
                <path d={ribbon(f.from, f.to, spec.hw)} fill={`url(#${spec.grad})`} opacity={spec.opacity} />
                {f.running && (
                  <path d={`M ${f.from.x} ${f.from.y} C ${(f.from.x + f.to.x) / 2} ${f.from.y}, ${(f.from.x + f.to.x) / 2} ${f.to.y}, ${f.to.x} ${f.to.y}`}
                    fill="none" stroke="#fbbf24" strokeWidth={1.6} strokeDasharray="4 8" opacity={0.9}>
                    <animate attributeName="stroke-dashoffset" from="24" to="0" dur="0.7s" repeatCount="indefinite" />
                  </path>
                )}
              </g>
            );
          })}

          {/* spawn (agent → worker hierarchy) — thin dotted */}
          {spawn.map((e, i) => {
            const a = pos.get(e.source), b = pos.get(e.target);
            if (!a || !b) return null;
            const from = { x: a.x + NODE_W, y: a.y + NODE_H / 2 }, to = { x: b.x, y: b.y + NODE_H / 2 };
            const cx = (from.x + to.x) / 2;
            return <path key={`sp-${i}`} d={`M ${from.x} ${from.y} C ${cx} ${from.y}, ${cx} ${to.y}, ${to.x} ${to.y}`}
              fill="none" stroke="#a855f7" strokeWidth={1.4} strokeDasharray="2 4" opacity={0.6} markerEnd="url(#ah-spawn)" />;
          })}

          {/* loopback (refine) — dashed arc under the nodes */}
          {loops.map((e, i) => {
            const a = pos.get(e.source), b = pos.get(e.target);
            if (!a || !b) return null;
            const cx = (a.x + b.x) / 2 + NODE_W / 2;
            const cy = Math.max(a.y, b.y) + NODE_H + 38;
            return (
              <g key={`lp-${i}`}>
                <path d={loopbackPath(a, b)} fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 4" opacity={0.85} markerEnd="url(#ah-loop)" />
                <text x={cx} y={cy} textAnchor="middle" fontSize="11" fill="#f59e0b" fontWeight={600}>
                  {e.label || `×${e.loop_count} refine`}
                </text>
              </g>
            );
          })}
        </svg>

        {/* stage headers */}
        {headers.map((h, i) => (
          <div key={`hdr-${i}`} className="absolute text-center text-[11px] font-semibold uppercase tracking-wide text-brand-700 dark:text-teal-300"
            style={{ left: h.x, top: 16, width: NODE_W }}>
            {h.label}
          </div>
        ))}

        {/* node cards */}
        {run.nodes.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          const isOrch = n.role === "orchestrate";
          const scorePct = n.score != null ? Math.max(0, Math.min(100, n.score)) : null;
          return (
            <div key={n.id}
              className={`absolute rounded-xl border px-3 py-2 text-xs shadow-sm backdrop-blur-[1px] transition-shadow ${STATUS_CARD[n.status] || STATUS_CARD.pending} ${n.status === "running" ? "shadow-lg ring-2 ring-amber-300/60 animate-pulse" : ""} ${isOrch ? "ring-2 ring-purple-400/60" : ""}`}
              style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}>
              <div className="flex items-start justify-between gap-1">
                <span className="font-semibold leading-tight">{n.label}</span>
                <div className="flex shrink-0 gap-1">
                  {n.loop_count > 1 && <span className="rounded bg-amber-500/90 px-1 text-[9px] font-bold text-white">×{n.loop_count}</span>}
                </div>
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-[9px] uppercase tracking-wide opacity-70">
                <span>{n.agent}</span>
                {isOrch && n.spawned_count > 0 && (
                  <span className="rounded bg-purple-500/90 px-1 text-[9px] font-bold normal-case text-white">⑂ {n.spawned_count}</span>
                )}
              </div>
              {scorePct != null && (
                <div className="mt-1.5">
                  <div className="flex items-center justify-between text-[10px] font-semibold">
                    <span>score</span><span>{Math.round(n.score!)}</span>
                  </div>
                  <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400" style={{ width: `${scorePct}%` }} />
                  </div>
                </div>
              )}
              <div className="absolute inset-x-3 bottom-1.5 flex items-center justify-between text-[10px] opacity-70">
                <span>{fmtCost(n.cost.usd)}</span>
                {n.latency_ms > 0 && <span>{fmtMs(n.latency_ms)}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* legend + run totals */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-slate-500 dark:text-slate-400">
        <Legend grad="linear-gradient(90deg,#14b8a6,#5eead4)" label="fan-out" />
        <Legend grad="linear-gradient(90deg,#2dd4bf,#0f766e)" label="fan-in" />
        <Legend grad="#a855f7" label="spawns worker" dotted />
        <Legend grad="#f59e0b" label="refine loop" dotted />
        <span className="ml-auto font-medium text-slate-600 dark:text-slate-300">
          {run.totals.llm_calls} agent calls · {fmtCost(run.totals.usd)}
          {run.totals.cache_read_tokens > 0 && <> · {run.totals.cache_read_tokens.toLocaleString()} cached</>}
          {run.totals.total_loops > 0 && <> · {run.totals.total_loops} loops</>}
        </span>
      </div>
    </div>
  );
}

function Legend({ grad, label, dotted }: { grad: string; label: string; dotted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2 w-5 rounded-full" style={{ background: dotted ? "none" : grad, border: dotted ? `1.5px dashed ${grad}` : undefined }} />
      {label}
    </span>
  );
}
