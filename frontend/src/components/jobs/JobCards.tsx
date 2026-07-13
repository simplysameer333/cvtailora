"use client";
// Job/alert list cards + free-tier banner for the Jobs page. Split out of
// app/jobs/page.tsx (2026-07-13, no-very-large-files) — all state stays in the
// page; these receive props/callbacks only.
import { useState } from "react";
import {
  FiBookmark, FiZap, FiExternalLink, FiClock, FiDollarSign, FiBriefcase,
  FiWifi, FiUser, FiFileText, FiBell, FiEdit2, FiTrash2,
  FiToggleLeft, FiToggleRight, FiLock, FiSearch, FiMapPin,
} from "react-icons/fi";
import type { Job, JobAlert } from "@/lib/api";
import JobMatchBadge from "@/components/JobMatchBadge";
import { formatDateTimeUtc } from "@/lib/datetime";

function timeAgo(iso?: string) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatSalary(job: Job) {
  if (!job.job_min_salary && !job.job_max_salary) return null;
  const cur = job.job_salary_currency ?? "$";
  const period = job.job_salary_period === "YEAR" ? "/yr" : job.job_salary_period === "HOUR" ? "/hr" : "";
  const fmt = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);
  if (job.job_min_salary && job.job_max_salary)
    return `${cur}${fmt(job.job_min_salary)}–${fmt(job.job_max_salary)}${period}`;
  return `${cur}${fmt((job.job_min_salary ?? job.job_max_salary)!)}${period}`;
}

function employerInitials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

// ── Pagination ────────────────────────────────────────────────────────────────


function FreeSearchBanner() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
      <FiLock className="w-4 h-4 text-amber-500 shrink-0" />
      <p className="text-amber-800 text-xs">
        <span className="font-semibold">Free plan — search only.</span>{" "}
        Upgrade to Plus or Pro to save jobs, set up alerts, and tailor your resume in one click.{" "}
        <a href="/settings/plan" className="font-semibold underline underline-offset-2 hover:text-amber-900">
          View plans →
        </a>
      </p>
    </div>
  );
}

// ── Job card ──────────────────────────────────────────────────────────────────

const EMPLOYMENT_LABEL: Record<string, string> = {
  FULLTIME: "Full-time",
  PARTTIME: "Part-time",
  CONTRACTOR: "Contract",
  INTERN: "Internship",
};

function JobCard({
  job,
  saved,
  seen,
  isFree,
  onSave,
  onUseSaved,
  onApply,
  onApplyChoice,
}: {
  job: Job;
  saved: boolean;
  seen: boolean;
  isFree: boolean;
  onSave: (job: Job) => void;
  onUseSaved: (job: Job) => void;
  onApply: (job: Job) => void;
  onApplyChoice: (job: Job) => void;
}) {
  const salary = formatSalary(job);
  const posted = timeAgo(job.job_posted_at_datetime_utc);
  const location = [job.job_city, job.job_state, job.job_country].filter(Boolean).join(", ");
  const empType = job.job_employment_type ? EMPLOYMENT_LABEL[job.job_employment_type] ?? job.job_employment_type : null;
  const skills = (job.job_required_skills ?? []).slice(0, 4);

  return (
    <div className="card flex flex-col sm:flex-row items-start gap-4 hover:border-brand-400 transition-colors">

      {/* Logo */}
      <div className="shrink-0 mt-0.5">
        {job.employer_logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={job.employer_logo}
            alt={job.employer_name}
            className="w-12 h-12 rounded-xl object-contain border border-slate-100 bg-white p-1"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-12 h-12 rounded-xl bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm">
            {employerInitials(job.employer_name)}
          </div>
        )}
      </div>

      {/* Main info — title + employer */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {job.job_apply_link && job.job_apply_link !== "#" ? (
            <a
              href={job.job_apply_link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onApply(job)}
              className="font-semibold text-slate-900 text-base leading-snug hover:text-brand-600 hover:underline underline-offset-2 transition-colors"
            >
              {job.job_title}
            </a>
          ) : (
            <h3 className="font-semibold text-slate-900 text-base leading-snug">{job.job_title}</h3>
          )}
          {seen && (
            <span className="shrink-0 text-[10px] font-semibold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
              Viewed
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500 truncate mt-0.5">
          {job.employer_name}
          {job.job_publisher && (
            <span className="ml-2 text-xs text-slate-400">via {job.job_publisher}</span>
          )}
        </p>
        {job.match && (
          <div className="mt-1.5">
            <JobMatchBadge match={job.match} />
          </div>
        )}
      </div>

      {/* Right column — meta on top, actions below, bookmark on the extreme right */}
      <div className="shrink-0 flex flex-col items-start sm:items-end gap-2.5 w-full sm:w-auto">
        <div className="flex items-center gap-1.5 flex-wrap sm:justify-end text-xs text-slate-500">
          {location && (
            <span className="flex items-center gap-1">
              <FiMapPin className="w-3 h-3" /> {location}
            </span>
          )}
          {job.job_is_remote && (
            <span className="font-semibold text-teal-600 bg-teal-50 rounded-full px-2 py-0.5">Remote</span>
          )}
          {empType && (
            <span className="bg-slate-100 rounded-full px-2 py-0.5">{empType}</span>
          )}
          {salary && <span className="font-medium text-slate-600">{salary}</span>}
          {posted && <span className="flex items-center gap-1 text-slate-400"><FiClock className="w-3 h-3" />{posted}</span>}
        </div>

        <div className="flex items-center gap-2">
          {isFree ? (
            /* Free tier — locked upsell */
            <a
              href="/settings/plan"
              className="flex items-center gap-1.5 btn-primary text-xs px-3 py-1.5 opacity-70"
              title="Upgrade to Plus or Pro to tailor your resume"
            >
              <FiLock className="w-3 h-3" /> Tailor Resume
            </a>
          ) : (
            /* Opens the resume picker — tailor new OR apply with a saved resume */
            <button
              onClick={() => onUseSaved(job)}
              className="btn-primary text-xs px-3 py-1.5 gap-1.5"
              title="AI-tailor a resume for this job, or apply with a saved one"
            >
              <FiZap className="w-3.5 h-3.5" /> Tailor Resume
            </button>
          )}

          {job.job_apply_link && job.job_apply_link !== "#" && (
            <button
              onClick={() => onApplyChoice(job)}
              className="btn-secondary text-xs px-3 py-1.5 gap-1.5"
            >
              Apply <FiExternalLink className="w-3.5 h-3.5" />
            </button>
          )}

          {isFree ? (
            <a
              href="/settings/plan"
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-300 cursor-pointer"
              title="Upgrade to save jobs"
            >
              <FiLock className="w-4 h-4" />
            </a>
          ) : (
            <button
              onClick={() => onSave(job)}
              title={saved ? "Remove from saved" : "Save job"}
              className={`rounded-lg border px-2.5 py-1.5 transition ${
                saved
                  ? "border-brand-300 bg-brand-50 text-brand-600 hover:bg-brand-100"
                  : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              <FiBookmark className={`w-4 h-4 ${saved ? "fill-brand-500" : ""}`} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Alert card ────────────────────────────────────────────────────────────────

function AlertCard({
  alert,
  onToggle,
  onEdit,
  onDelete,
}: {
  alert: JobAlert;
  onToggle: (id: string) => void;
  onEdit: (alert: JobAlert) => void;
  onDelete: (id: string) => void;
}) {
  const allTags = [
    ...alert.query_tags,
    ...(alert.company ? [alert.company] : []),
    ...alert.location_tags,
  ];
  const lastSent = alert.last_sent_at ? timeAgo(alert.last_sent_at) : null;
  // "Last checked" renders in the app-wide configured display timezone
  // (backend stores UTC) — see lib/datetime.
  const lastChecked = alert.last_checked_at
    ? formatDateTimeUtc(alert.last_checked_at, { year: undefined })
    : null;

  return (
    <div className={`card flex items-start gap-4 transition-colors ${
      alert.is_active ? "hover:border-brand-400" : "opacity-60"
    }`}>
      <div className="shrink-0 mt-0.5">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
          alert.is_active ? "bg-brand-100" : "bg-slate-100"
        }`}>
          <FiBell className={`w-5 h-5 ${alert.is_active ? "text-brand-600" : "text-slate-400"}`} />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-900 text-sm">{alert.name}</p>
            {lastSent ? (
              <p className="text-xs text-slate-400 mt-0.5">Last emailed {lastSent}</p>
            ) : (
              <p className="text-xs text-slate-400 mt-0.5">No email sent yet</p>
            )}
            {lastChecked && (
              <p className="text-xs text-slate-400 mt-0.5">
                Last checked {lastChecked}
                {alert.last_result && <span className="text-slate-500"> · {alert.last_result}</span>}
              </p>
            )}
          </div>
          {/* Toggle */}
          <button
            onClick={() => onToggle(alert.id)}
            title={alert.is_active ? "Pause alert" : "Resume alert"}
            className="text-slate-400 hover:text-brand-600 transition shrink-0 mt-0.5"
          >
            {alert.is_active
              ? <FiToggleRight className="w-5 h-5 text-brand-500" />
              : <FiToggleLeft className="w-5 h-5" />
            }
          </button>
        </div>

        {/* Tag chips */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {alert.query_tags.map((t) => (
              <span key={t} className="text-xs bg-brand-50 text-brand-700 rounded-full px-2.5 py-0.5 border border-brand-100">
                {t}
              </span>
            ))}
            {alert.company && (
              <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2.5 py-0.5">
                {alert.company}
              </span>
            )}
            {alert.location_tags.map((t) => (
              <span key={t} className="text-xs bg-teal-50 text-teal-700 rounded-full px-2.5 py-0.5 border border-teal-100 flex items-center gap-1">
                <FiMapPin className="w-2.5 h-2.5" />{t}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-2.5">
          <button
            onClick={() => onEdit(alert)}
            className="btn-secondary text-xs px-3 py-1.5 gap-1.5"
          >
            <FiEdit2 className="w-3.5 h-3.5" /> Edit
          </button>
          <button
            onClick={() => onDelete(alert.id)}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500
                       hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition gap-1.5 flex items-center"
          >
            <FiTrash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────


export { JobCard, AlertCard, FreeSearchBanner };
