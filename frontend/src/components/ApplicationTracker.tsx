"use client";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  FiExternalLink, FiTrash2, FiLoader, FiMapPin, FiZap, FiLock, FiInbox,
} from "react-icons/fi";
import {
  getSavedJobs, setApplicationStatus, unsaveJob,
  type Job, type ApplicationStatus,
} from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { hasFeature } from "@/lib/config";
import ApplicationStatusSelect, { STATUS_META } from "./ApplicationStatusSelect";

/** Stat cards double as filters; "Total" plus the three cumulative stages. */
type TileKey = "all" | "applied" | "interview" | "offer";
const STAT_TILES: { key: TileKey; label: string }[] = [
  { key: "all", label: "Total" },
  { key: "applied", label: "Applied" },
  { key: "interview", label: "Interview" },
  { key: "offer", label: "Offer" },
];

function jobLocation(job: Job): string {
  return [job.job_city, job.job_state, job.job_country].filter(Boolean).join(", ");
}

/**
 * Application tracker (J4) — the "Applications" tab on Find Jobs.
 * Lists the user's tracked (saved) jobs with a per-row status changer, stat
 * cards that double as filters, and remove. Statuses auto-advance from
 * Apply/Tailor clicks elsewhere; here the user makes the later transitions.
 */
export default function ApplicationTracker({ onTailor }: { onTailor: (job: Job) => void }) {
  const { data: session } = useAuth();
  const tier = session?.user?.tier ?? "free";
  const canUse = hasFeature(tier, "save_jobs");

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | ApplicationStatus>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!canUse) return;
    setLoading(true);
    getSavedJobs()
      .then(setJobs)
      .catch(() => toast.error("Could not load your applications."))
      .finally(() => setLoading(false));
  }, [canUse]);

  // Counts drive the stat tiles. "applied" is cumulative (applied + beyond) so
  // the tiles read as a funnel, matching the backend funnel_counts contract.
  const counts = useMemo(() => {
    const c = { all: jobs.length, applied: 0, interview: 0, offer: 0, rejected: 0 };
    for (const j of jobs) {
      const s = j._status ?? "saved";
      if (s === "applied" || s === "interview" || s === "offer") c.applied++;
      if (s === "interview" || s === "offer") c.interview++;
      if (s === "offer") c.offer++;
      if (s === "rejected") c.rejected++;
    }
    return c;
  }, [jobs]);

  const visible = useMemo(() => {
    if (filter === "all") return jobs;
    if (filter === "applied")
      return jobs.filter((j) => ["applied", "interview", "offer"].includes(j._status ?? "saved"));
    if (filter === "interview")
      return jobs.filter((j) => ["interview", "offer"].includes(j._status ?? "saved"));
    return jobs.filter((j) => (j._status ?? "saved") === filter);
  }, [jobs, filter]);

  async function handleStatus(job: Job, status: ApplicationStatus) {
    const prev = job._status ?? "saved";
    setJobs((js) => js.map((j) => j.job_id === job.job_id ? { ...j, _status: status } : j));
    try {
      await setApplicationStatus(job.job_id, status);
    } catch {
      setJobs((js) => js.map((j) => j.job_id === job.job_id ? { ...j, _status: prev } : j));
      toast.error("Could not update status.");
    }
  }

  async function handleRemove(job: Job) {
    setBusyId(job.job_id);
    try {
      await unsaveJob(job.job_id);
      setJobs((js) => js.filter((j) => j.job_id !== job.job_id));
    } catch {
      toast.error("Could not remove.");
    } finally {
      setBusyId(null);
    }
  }

  if (!canUse) {
    return (
      <div className="card text-center py-12 flex flex-col items-center gap-3">
        <FiLock className="w-8 h-8 text-slate-300" />
        <p className="text-sm font-medium text-slate-600">Application tracking is a Plus feature</p>
        <p className="text-xs text-slate-400">Save jobs and track them from applied to offer. Upgrade to unlock.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Stat tiles / filters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {STAT_TILES.map(({ key, label }) => {
          const active = filter === key;
          const n = key === "all" ? counts.all : counts[key];
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                active ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white hover:border-brand-300"
              }`}
            >
              <div className="text-2xl font-bold text-slate-900">{n}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </button>
          );
        })}
      </div>

      {counts.rejected > 0 && (
        <button
          onClick={() => setFilter("rejected")}
          className={`self-start text-xs font-medium rounded-full border px-2.5 py-1 transition-colors ${
            filter === "rejected" ? STAT_META_REJECTED_ACTIVE : "text-slate-500 bg-white border-slate-200 hover:border-rose-300"
          }`}
        >
          {counts.rejected} rejected
        </button>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <FiLoader className="w-5 h-5 animate-spin mr-2" /> Loading your applications…
        </div>
      )}

      {!loading && jobs.length === 0 && (
        <div className="card text-center py-14 flex flex-col items-center gap-3 text-slate-400">
          <FiInbox className="w-8 h-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">No applications tracked yet</p>
          <p className="text-xs">Save a job, or hit Apply / Tailor Resume — it'll show up here automatically.</p>
        </div>
      )}

      {!loading && jobs.length > 0 && visible.length === 0 && (
        <div className="card text-center py-8 text-slate-400 text-sm">
          No applications at this stage.
        </div>
      )}

      {!loading && visible.length > 0 && (
        <div className="flex flex-col gap-2">
          {visible.map((job) => {
            const location = jobLocation(job);
            return (
              <div key={job.job_id} className="card flex flex-col sm:flex-row sm:items-center gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    {job.job_apply_link && job.job_apply_link !== "#" ? (
                      <a
                        href={job.job_apply_link} target="_blank" rel="noopener noreferrer"
                        className="font-semibold text-slate-900 text-sm truncate hover:text-brand-600 hover:underline"
                      >
                        {job.job_title}
                      </a>
                    ) : (
                      <span className="font-semibold text-slate-900 text-sm truncate">{job.job_title}</span>
                    )}
                    {job._tailored && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold text-teal-700 bg-teal-50 rounded-full px-1.5 py-0.5">
                        <FiZap className="w-2.5 h-2.5" /> Tailored
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {job.employer_name}
                    {location && <span className="ml-2 inline-flex items-center gap-1"><FiMapPin className="w-3 h-3" />{location}</span>}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <ApplicationStatusSelect
                    value={job._status ?? "saved"}
                    onChange={(s) => handleStatus(job, s)}
                  />
                  <button
                    onClick={() => onTailor(job)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition"
                    title="Tailor a resume for this job"
                  >
                    <FiZap className="w-4 h-4" />
                  </button>
                  {job.job_apply_link && job.job_apply_link !== "#" && (
                    <a
                      href={job.job_apply_link} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition"
                      title="Open listing"
                    >
                      <FiExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    onClick={() => handleRemove(job)}
                    disabled={busyId === job.job_id}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-50"
                    title="Remove from tracker"
                  >
                    {busyId === job.job_id ? <FiLoader className="w-4 h-4 animate-spin" /> : <FiTrash2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const STAT_META_REJECTED_ACTIVE = STATUS_META.rejected.badge;
