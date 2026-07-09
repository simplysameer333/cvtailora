"use client";

import { FiSliders } from "react-icons/fi";
import type { Job } from "@/lib/api";

/** Minimum-match filter buckets — thresholds mirror the JobMatchBadge scale. */
const BUCKETS = [
  { min: 0, label: "All matches", dot: "bg-slate-400", active: "bg-brand-600 text-white border-brand-600" },
  { min: 40, label: "40%+ · Fair", dot: "bg-amber-500", active: "bg-amber-500 text-white border-amber-500" },
  { min: 60, label: "60%+ · Strong", dot: "bg-teal-500", active: "bg-teal-500 text-white border-teal-500" },
  { min: 80, label: "80%+ · Excellent", dot: "bg-emerald-500", active: "bg-emerald-600 text-white border-emerald-600" },
] as const;

/**
 * Filter job results by match % (single-select minimum threshold).
 * Pure client-side. Hidden when no result carries a match score.
 *
 * variant "chips" — compact horizontal row (mobile, above the results)
 * variant "panel" — card with vertical options (desktop side rail)
 */
export default function MatchFilterChips({
  jobs,
  minMatch,
  onChange,
  variant = "chips",
}: {
  jobs: Job[];
  minMatch: number;
  onChange: (min: number) => void;
  variant?: "chips" | "panel";
}) {
  if (!jobs.some((j) => j.match)) return null;

  const count = (min: number) =>
    min === 0 ? jobs.length : jobs.filter((j) => (j.match?.pct ?? -1) >= min).length;

  if (variant === "panel") {
    return (
      <div className="card">
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2 mb-3">
          <FiSliders className="w-3.5 h-3.5" /> Filter by match
        </h3>
        <div className="flex flex-col gap-1.5">
          {BUCKETS.map(({ min, label, dot, active }) => {
            const selected = minMatch === min;
            return (
              <button
                key={min}
                onClick={() => onChange(min)}
                className={`flex items-center justify-between text-xs font-medium rounded-lg border px-3 py-2 transition-colors ${
                  selected
                    ? active
                    : "text-slate-600 bg-white border-slate-200 hover:border-brand-400"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${selected ? "bg-white" : dot}`} />
                  {label}
                </span>
                <span className={selected ? "text-white/80" : "text-slate-400"}>{count(min)}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-slate-400 mr-0.5">Match:</span>
      {BUCKETS.map(({ min, label, active }) => {
        const selected = minMatch === min;
        return (
          <button
            key={min}
            onClick={() => onChange(min)}
            className={`text-xs font-medium rounded-full border px-2.5 py-1 transition-colors ${
              selected
                ? active
                : "text-slate-500 bg-white border-slate-200 hover:border-brand-400"
            }`}
          >
            {label} ({count(min)})
          </button>
        );
      })}
    </div>
  );
}
