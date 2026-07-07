"use client";
import { useEffect, useState } from "react";
import {
  FiLoader, FiMail, FiBriefcase, FiDownload,
  FiCheckSquare, FiEye, FiBookmark, FiBell, FiZap, FiBookOpen, FiTrendingUp,
} from "react-icons/fi";
import {
  getAccountAnalytics, listSavedResumes, getUserStats,
  type AccountAnalytics, type SavedResume, type ResumeSession,
} from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { hasFeature } from "@/lib/config";

const ACTION_META: Record<string, { icon: React.ComponentType<{ className?: string }>; label: (m: Record<string, unknown>) => string; color: string }> = {
  "job_alert.email_sent": {
    icon: FiMail,
    color: "bg-teal-50 text-teal-600",
    label: (m) => `Job alert email sent — "${m.alert_name}" · ${m.job_count} job${Number(m.job_count) === 1 ? "" : "s"}`,
  },
  "job_alert.email_no_results": {
    icon: FiMail,
    color: "bg-slate-100 text-slate-500",
    label: (m) => `Alert "${m.alert_name}" ran — no new matching jobs`,
  },
  "resume.generate.complete": {
    icon: FiZap,
    color: "bg-amber-50 text-amber-600",
    label: () => "AI resume tailoring completed",
  },
  "resume.export": {
    icon: FiDownload,
    color: "bg-brand-50 text-brand-600",
    label: (m) => `Resume exported${m.format ? ` (${String(m.format).toUpperCase()})` : ""}`,
  },
  "resume.cv_score": {
    icon: FiCheckSquare,
    color: "bg-violet-50 text-violet-600",
    label: () => "CV Score analysis run",
  },
  "cover_letter.generate": {
    icon: FiMail,
    color: "bg-brand-50 text-brand-600",
    label: (m) => `Cover letter generated${m.role ? ` — ${m.role}` : ""}`,
  },
  "interview_prep.generate": {
    icon: FiBookOpen,
    color: "bg-teal-50 text-teal-600",
    label: (m) => `Interview questions generated${m.role ? ` — ${m.role}` : ""}${m.question_count ? ` (${m.question_count})` : ""}`,
  },
  "interview_prep.email_sent": {
    icon: FiMail,
    color: "bg-sky-50 text-sky-600",
    label: (m) => `Interview questions emailed${m.question_count ? ` (${m.question_count} questions)` : ""}`,
  },
};

// ── Dependency-free SVG charts ────────────────────────────────────────────────

const DONUT_COLORS = ["#10b981", "#f59e0b", "#6366f1", "#0ea5e9", "#f43f5e", "#64748b"];

function DonutChart({ slices }: { slices: { label: string; value: number }[] }) {
  const data = slices.filter((s) => s.value > 0);
  const total = data.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) {
    return <p className="text-sm text-slate-400 text-center py-10">No activity yet — charts appear as you use the platform.</p>;
  }
  const r = 40;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-6 flex-wrap">
      <svg viewBox="0 0 100 100" className="w-36 h-36 -rotate-90 shrink-0">
        {data.map((s, i) => {
          const frac = s.value / total;
          const seg = (
            <circle
              key={s.label}
              cx="50" cy="50" r={r} fill="none"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]} strokeWidth="14"
              strokeDasharray={`${frac * c} ${c}`}
              strokeDashoffset={-offset * c}
            />
          );
          offset += frac;
          return seg;
        })}
      </svg>
      <div className="flex flex-col gap-1.5">
        {data.map((s, i) => (
          <div key={s.label} className="flex items-center gap-2 text-sm">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="text-slate-600">{s.label}</span>
            <span className="font-semibold text-slate-800 ml-1">{s.value}</span>
            <span className="text-xs text-slate-400">({Math.round((s.value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityBars({ daily }: { daily: { date: string; count: number }[] }) {
  // Fill the last 30 days so gaps show as empty bars
  const byDate = new Map(daily.map((d) => [d.date, d.count]));
  const days: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, count: byDate.get(key) ?? 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.count));
  const hasAny = days.some((d) => d.count > 0);
  if (!hasAny) {
    return <p className="text-sm text-slate-400 text-center py-10">No activity in the last 30 days.</p>;
  }

  return (
    <div>
      <div className="flex items-end gap-[3px] h-32">
        {days.map((d) => (
          <div
            key={d.date}
            className="flex-1 rounded-t-sm bg-teal-500/80 hover:bg-teal-600 transition-colors min-w-[4px]"
            style={{ height: `${Math.max(d.count > 0 ? 8 : 2, (d.count / max) * 100)}%` }}
            title={`${new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}: ${d.count} action${d.count === 1 ? "" : "s"}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1.5">
        <span>{new Date(days[0].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

// Resume quality trend — headline CV scores of recent tailoring runs
function QualityTrend() {
  const [sessions, setSessions] = useState<ResumeSession[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getUserStats()
      .then((s) => setSessions([...s.recent_sessions].reverse()))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  return (
    // h-full + flex column so this card always matches the feed card's height
    <div className="card !p-5 h-full flex flex-col">
      <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
        <FiTrendingUp className="w-4 h-4" /> Resume quality trend
      </h2>
      <p className="text-xs text-slate-400 mb-4">Headline CV score of your recent tailoring runs.</p>

      {!loaded ? (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <FiLoader className="w-5 h-5 animate-spin" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-slate-300">
          <p className="text-sm text-slate-400 px-6 text-center">Tailor a resume and its score will appear here.</p>
        </div>
      ) : (
        <>
          <div className="flex-1 flex items-end gap-2 min-h-[9rem]">
            {sessions.slice(-12).map((s) => {
              const color = s.min_score >= 80 ? "bg-teal-500" : s.min_score >= 65 ? "bg-amber-400" : "bg-red-400";
              return (
                <div key={s.id} className="flex-1 h-full flex flex-col items-center justify-end gap-1 min-w-0"
                  title={`${s.target_role || "Resume"} — ${s.min_score}/100 (${new Date(s.created_at).toLocaleDateString()})`}>
                  <span className="text-[10px] font-semibold text-slate-500">{s.min_score}</span>
                  <div className={`w-full rounded-t-md ${color}`} style={{ height: `${Math.max(6, s.min_score)}%` }} />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 mt-1.5">
            <span>Older</span>
            <span>Latest</span>
          </div>
        </>
      )}
    </div>
  );
}

// Resume usage — how many are saved and which jobs the tailored ones targeted
function ResumeUsageCard() {
  const { data: session } = useAuth();
  const tier = session?.user?.tier ?? "free";
  const canUse = hasFeature(tier, "resume_library");
  const [resumes, setResumes] = useState<SavedResume[]>([]);

  useEffect(() => {
    if (!canUse) return;
    listSavedResumes().then(setResumes).catch(() => {});
  }, [canUse]);

  const uploaded = resumes.filter((r) => r.type === "uploaded").length;
  const tailored = resumes.filter((r) => r.type === "tailored");

  return (
    <div className="card !p-5">
      <h2 className="font-semibold text-slate-800 text-sm mb-3">Resume usage</h2>
      {!canUse ? (
        <p className="text-sm text-slate-400 py-6 text-center">Resume Library is a Plus feature.</p>
      ) : resumes.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">No resumes in your library yet.</p>
      ) : (
        <>
          <div className="flex items-center gap-4 text-sm mb-3">
            <span><span className="font-bold text-slate-900">{uploaded}</span> <span className="text-slate-500">uploaded</span></span>
            <span><span className="font-bold text-slate-900">{tailored.length}</span> <span className="text-slate-500">tailored</span></span>
          </div>
          {tailored.length > 0 && (
            <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-2.5">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Tailored for</p>
              {tailored.slice(0, 5).map((r) => (
                <p key={r.id} className="text-xs text-slate-600 truncate">
                  <span className="font-medium text-slate-800">{r.name}</span>
                  {(r.tailored_for_job || r.tailored_for_employer) && (
                    <span className="text-slate-400"> → {[r.tailored_for_job, r.tailored_for_employer].filter(Boolean).join(" @ ")}</span>
                  )}
                </p>
              ))}
              {tailored.length > 5 && <p className="text-xs text-slate-400">+{tailored.length - 5} more</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Compact horizontal stat — icon + number + label in one tight row
function StatCard({ icon: Icon, label, value, sub }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="card !p-3.5 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-slate-900 leading-tight">{value}</p>
        <p className="text-xs text-slate-500 truncate">{label}</p>
        {sub && <p className="text-[10px] text-slate-400 truncate">{sub}</p>}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AccountAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAccountAnalytics().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <FiLoader className="w-6 h-6 animate-spin mr-2" /> Loading analytics…
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-slate-500 py-12 text-center">Could not load analytics. Try refreshing.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
        <p className="text-slate-500 text-sm mt-1">
          What the platform has done for you — automated alerts, AI tailoring, exports and activity.
        </p>
      </div>

      {/* Compact stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        <StatCard icon={FiMail}       label="Alert emails"     value={data.alert_emails_sent}
          sub={data.alert_jobs_delivered > 0 ? `${data.alert_jobs_delivered} jobs delivered` : undefined} />
        <StatCard icon={FiBell}       label="Active alerts"    value={data.alerts_active} />
        <StatCard icon={FiZap}        label="Resumes tailored" value={data.resumes_generated} />
        <StatCard icon={FiDownload}   label="Exports"          value={data.resumes_exported} />
        <StatCard icon={FiCheckSquare} label="CV scores"       value={data.cv_scores_run} />
        <StatCard icon={FiMail}       label="Cover letters"    value={data.cover_letters} />
        <StatCard icon={FiBookOpen}   label="Interview preps"  value={data.interview_preps} />
        <StatCard icon={FiBookmark}   label="Jobs saved"       value={data.jobs_saved} />
        <StatCard icon={FiEye}        label="Jobs viewed"      value={data.jobs_viewed} />
      </div>

      {/* Charts row — activity mix, 30-day histogram, resume usage, quality trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4 gap-4 items-stretch">
        <div className="card !p-5">
          <h2 className="font-semibold text-slate-800 text-sm mb-3">Activity breakdown</h2>
          <DonutChart slices={[
            { label: "Resumes tailored", value: data.resumes_generated },
            { label: "Resumes exported", value: data.resumes_exported },
            { label: "CV scores",        value: data.cv_scores_run },
            { label: "Cover letters",    value: data.cover_letters },
            { label: "Interview preps",  value: data.interview_preps },
            { label: "Alert emails",     value: data.alert_emails_sent },
          ]} />
        </div>
        <div className="card !p-5">
          <h2 className="font-semibold text-slate-800 text-sm mb-3">Last 30 days</h2>
          <ActivityBars daily={data.daily ?? []} />
        </div>
        <ResumeUsageCard />
        <QualityTrend />
      </div>

      {/* Automated activity — last section: fixed height, scrolls internally as it grows */}
      <div className="card">
        <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <FiBriefcase className="w-4 h-4" /> Automated activity
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          Everything the platform did on your behalf, newest first.
        </p>

        {data.recent.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-slate-400 text-sm">
            No automated activity yet — create a job alert or tailor a resume and it will show up here.
          </div>
        ) : (
          <div className="flex flex-col max-h-80 overflow-y-auto overscroll-contain pr-1">
            {data.recent.map((entry, i) => {
              const meta = ACTION_META[entry.action];
              if (!meta) return null;
              const Icon = meta.icon;
              return (
                <div key={i} className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${meta.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 truncate">{meta.label(entry.metadata)}</p>
                    {entry.action === "job_alert.email_sent" && Array.isArray(entry.metadata.jobs) && (
                      <p className="text-xs text-slate-400 truncate">
                        {(entry.metadata.jobs as { title: string; employer: string }[])
                          .slice(0, 3).map((j) => `${j.title} @ ${j.employer}`).join(" · ")}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">
                    {new Date(entry.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
