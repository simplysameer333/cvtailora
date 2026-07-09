"use client";

import type { ApplicationFunnel } from "@/lib/api";

/** Forward stages, widest → narrowest, each a proportion of the "saved" base. */
const STAGES: { key: keyof ApplicationFunnel; label: string; bar: string }[] = [
  { key: "saved",     label: "Saved",     bar: "bg-slate-400" },
  { key: "applied",   label: "Applied",   bar: "bg-brand-500" },
  { key: "interview", label: "Interview", bar: "bg-amber-500" },
  { key: "offer",     label: "Offer",     bar: "bg-emerald-500" },
];

/**
 * Application funnel (J4) on the Analytics page — saved → applied → interview
 * → offer as proportional bars, with rejected shown separately. Dependency-free.
 */
export default function ApplicationFunnelCard({ funnel }: { funnel: ApplicationFunnel }) {
  const base = funnel.saved || 1; // avoid /0; when empty every bar is 0-width anyway

  return (
    <div className="card !p-5">
      <h2 className="font-semibold text-slate-800 text-sm mb-3">Application funnel</h2>

      {funnel.total === 0 ? (
        <p className="text-xs text-slate-400 py-6 text-center">
          No tracked applications yet. Apply or tailor from Find Jobs to build your pipeline.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {STAGES.map(({ key, label, bar }) => {
            const value = funnel[key];
            const pct = Math.round((value / base) * 100);
            return (
              <div key={key}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-600 font-medium">{label}</span>
                  <span className="text-slate-400">{value}{key !== "saved" && ` · ${pct}%`}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full rounded-full ${bar} transition-all`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}

          {funnel.rejected > 0 && (
            <p className="text-xs text-rose-500 mt-1">{funnel.rejected} rejected</p>
          )}
        </div>
      )}
    </div>
  );
}
