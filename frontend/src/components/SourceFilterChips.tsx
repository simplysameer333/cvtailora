"use client";

import type { Job } from "@/lib/api";

/** Publisher bucket for a job — listings without a publisher group as "Other". */
export function jobSource(job: Job): string {
  return job.job_publisher?.trim() || "Other";
}

/**
 * Source on/off chips above job results (J9) — one chip per job board found in
 * the CURRENT results, with counts. Pure client-side filter: toggling never
 * re-queries the API. Hidden when the results all come from one source.
 */
export default function SourceFilterChips({
  jobs,
  hidden,
  onToggle,
}: {
  jobs: Job[];
  hidden: Set<string>;
  onToggle: (source: string) => void;
}) {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    const src = jobSource(job);
    counts.set(src, (counts.get(src) ?? 0) + 1);
  }
  if (counts.size < 2) return null;

  const sources = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-slate-400 mr-0.5">Sources:</span>
      {sources.map(([src, count]) => {
        const off = hidden.has(src);
        return (
          <button
            key={src}
            onClick={() => onToggle(src)}
            title={off ? `Show ${src} jobs` : `Hide ${src} jobs`}
            className={`text-xs font-medium rounded-full border px-2.5 py-1 transition-colors ${
              off
                ? "text-slate-400 bg-slate-50 border-slate-200 line-through"
                : "text-brand-700 bg-brand-50 border-brand-200 hover:border-brand-400"
            }`}
          >
            {src} ({count})
          </button>
        );
      })}
    </div>
  );
}
