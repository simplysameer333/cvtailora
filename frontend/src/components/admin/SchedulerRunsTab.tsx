"use client";
import { useEffect, useState } from "react";
import { FiClock, FiMail, FiInbox, FiLoader, FiChevronDown, FiChevronRight } from "react-icons/fi";
import { fetchSchedulerRuns, type SchedulerRun } from "@/lib/api";

import { formatDateTimeUtc } from "@/lib/datetime";

/** All timestamps render in UTC with an explicit "UTC" label (user request) —
 *  the backend stores/serves UTC, and the scheduler itself runs on UTC. */
function schedulerTime(utcIso: string): string {
  return formatDateTimeUtc(utcIso, {
    weekday: "short", day: "numeric", year: undefined,
  });
}

function DeliveryRow({ d }: { d: SchedulerRun["deliveries"][number] }) {
  const [open, setOpen] = useState(false);
  const expandable = d.type === "sent" && d.jobs.length > 0;

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <button
        onClick={() => expandable && setOpen((o) => !o)}
        className={`w-full flex items-center gap-2 text-left ${expandable ? "cursor-pointer" : "cursor-default"}`}
      >
        {expandable
          ? (open ? <FiChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <FiChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />)
          : <span className="w-3.5 shrink-0" />}
        <FiMail className={`w-3.5 h-3.5 shrink-0 ${d.type === "sent" ? "text-teal-600" : "text-amber-500"}`} />
        <span className="text-xs font-medium text-slate-700 truncate">{d.recipient}</span>
        <span className="text-xs text-slate-400 truncate">· {d.alert_name}</span>
        <span className={`ml-auto shrink-0 text-[11px] font-semibold rounded-full px-2 py-0.5 ${
          d.type === "sent" ? "text-teal-700 bg-teal-50" : "text-amber-700 bg-amber-50"
        }`}>
          {d.type === "sent" ? `${d.job_count} job${d.job_count !== 1 ? "s" : ""} sent` : "no-results email"}
        </span>
        <span className="shrink-0 text-[11px] text-slate-400">{schedulerTime(d.at)}</span>
      </button>

      {open && (
        <ul className="mt-2 ml-9 space-y-1">
          {d.jobs.map((j, i) => (
            <li key={i} className="text-xs text-slate-600">
              {j.title} <span className="text-slate-400">@ {j.employer}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Admin → Alert Scheduler: when each daily run happened and exactly what it
 * delivered — recipient, alert, and the jobs emailed. Times in the configured
 * display timezone.
 */
export default function SchedulerRunsTab() {
  const [runs, setRuns] = useState<SchedulerRun[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchSchedulerRuns().then(setRuns).catch(() => setError(true));
  }, []);

  if (error) return <div className="py-16 text-center text-slate-400">Could not load scheduler history.</div>;
  if (!runs) return (
    <div className="flex items-center justify-center py-16 text-slate-400">
      <FiLoader className="w-5 h-5 animate-spin mr-2" /> Loading scheduler history…
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Daily alert-scheduler runs (newest first) and the emails each run delivered.
        Times shown in the app&apos;s configured display timezone.
      </p>

      {runs.length === 0 && (
        <div className="card text-center py-12 text-slate-400 text-sm">
          No scheduler runs recorded yet — history starts from the run-tracking release (2026-07-11).
        </div>
      )}

      {runs.map((run) => (
        <div key={run.date} className="card">
          <div className="flex items-center gap-2 mb-3">
            <FiClock className="w-4 h-4 text-brand-600" />
            <h3 className="font-semibold text-slate-900 text-sm">{schedulerTime(run.started_at)}</h3>
            <span className="text-xs text-slate-400">({run.date} UTC run)</span>
            <span className="ml-auto text-xs font-medium text-slate-500">
              {run.deliveries.length} email{run.deliveries.length !== 1 ? "s" : ""}
            </span>
          </div>

          {run.deliveries.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-slate-400 rounded-lg border border-dashed border-slate-200 px-3 py-2.5">
              <FiInbox className="w-3.5 h-3.5" />
              Ran, but sent no emails — no alert had new jobs that day.
            </div>
          ) : (
            <div className="space-y-1.5">
              {run.deliveries.map((d, i) => <DeliveryRow key={i} d={d} />)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
