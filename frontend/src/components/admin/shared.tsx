"use client";
// Shared building blocks for the admin tabs (split out of admin/page.tsx).
import { FiX, FiClock, FiRefreshCw } from "react-icons/fi";
import { formatDateTimeLocal } from "@/lib/datetime";


// ── Helpers ────────────────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  free: "bg-slate-100 text-slate-600",
  plus: "bg-teal-100 text-teal-700",
  pro:  "bg-brand-100 text-brand-700",
};

const ACTION_LABELS: Record<string, string> = {
  "user.update":            "Updated user",
  "user.delete":            "Deleted user",
  "profile.save":           "Saved profile",
  "resume.generate":        "Generated resume",
  "resume.generate.complete": "Generated resume (AI)",
  "resume.cv_score":        "Checked CV Score",
  "resume.export":          "Exported resume",
  "cv_template.recompute_scores": "Recomputed template scores",
  "resume_library.upload":  "Uploaded to library",
  "job_alert.create":       "Created alert",
  "job_alert.delete":       "Deleted alert",
  "cv_template.create":     "Created template",
  "cv_template.update":     "Updated template",
  "cv_template.delete":     "Deleted template",
  "cv_template.generate":   "AI-generated template",
  "system_config.update":   "Changed system settings",
};

// ── Reusable per-column table filters ──────────────────────────────────────────
// Rendered in a second header row so each column filters itself, instead of a
// separate filter bar above the table. Shared across admin tables (Users, Audit).
const COL_FILTER_INPUT =
  "w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-normal normal-case " +
  "text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-300";

function ColFilterText({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? "Filter…"}
        className={`${COL_FILTER_INPUT} pr-6`}
      />
      {value && (
        <button onClick={() => onChange("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600">
          <FiX className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function ColFilterSelect({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={COL_FILTER_INPUT}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// Small coloured chip for the account type shown next to a user in the audit log.
const ACCOUNT_BADGE: Record<string, { label: string; cls: string }> = {
  free:      { label: "Free",      cls: "bg-slate-100 text-slate-600" },
  plus:      { label: "Plus",      cls: "bg-blue-100 text-blue-700" },
  pro:       { label: "Pro",       cls: "bg-amber-100 text-amber-700" },
  anonymous: { label: "Anonymous", cls: "bg-slate-100 text-slate-400 italic" },
};

function AccountTypeBadge({ tier }: { tier?: string }) {
  const t = (tier || "free").toLowerCase();
  const b = ACCOUNT_BADGE[t] ?? ACCOUNT_BADGE.free;
  return <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 whitespace-nowrap ${b.cls}`}>{b.label}</span>;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(iso: string | null) {
  return formatDateTimeLocal(iso);
}

function timeAgo(date: Date | null): string {
  if (!date) return "";
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ── Tab header bar (shared) ────────────────────────────────────────────────────

function TabHeader({
  count, label, fetchedAt, loading, onRefresh,
}: {
  count?: number | string;
  label: string;
  fetchedAt: Date | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <p className="text-sm text-slate-500">
        {count !== undefined ? `${count} ${label}` : label}
      </p>
      <div className="flex items-center gap-3">
        {fetchedAt && !loading && (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <FiClock className="w-3 h-3" /> {timeAgo(fetchedAt)}
          </span>
        )}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 disabled:opacity-40"
        >
          <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
    </div>
  );
}

function Spinner({ text }: { text: string }) {
  return <div className="py-16 text-center text-slate-400">{text}</div>;
}

export { TIER_COLORS, ACTION_LABELS, ColFilterText, ColFilterSelect, AccountTypeBadge, formatDate, formatDateTime, timeAgo, TabHeader, Spinner };
