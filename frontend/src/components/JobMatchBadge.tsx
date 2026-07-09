"use client";

import type { JobMatch } from "@/lib/api";

/** Colour buckets mirror the backend label thresholds (job_match_service). */
function tone(pct: number): string {
  if (pct >= 80) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (pct >= 60) return "text-teal-700 bg-teal-50 border-teal-200";
  if (pct >= 40) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-slate-500 bg-slate-50 border-slate-200";
}

/**
 * Per-user match badge on a job card (J3) — e.g. "78% · Strong match".
 * Tooltip lists which of the user's skills were found in the listing.
 */
export default function JobMatchBadge({ match }: { match: JobMatch }) {
  const tip = match.matched_skills.length
    ? `Matched skills: ${match.matched_skills.join(", ")}`
    : "No direct skill matches found in this listing";

  return (
    <span
      title={tip}
      className={`inline-flex items-center gap-1 shrink-0 text-[11px] font-semibold rounded-full border px-2 py-0.5 cursor-default ${tone(match.pct)}`}
    >
      {match.pct}% · {match.label}
    </span>
  );
}
