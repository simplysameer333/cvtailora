"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { getUserStats, type AccountStats, type ResumeSession } from "@/lib/api";
import { type Tier } from "@/components/PricingTiers";
import {
  FiFileText, FiBookmark, FiBell, FiBriefcase,
  FiArrowRight, FiClock, FiLock,
} from "react-icons/fi";

// ── Helpers ───────────────────────────────────────────────────────────────────

const LIMITS: Record<string, { sessions: string; resumes: string; saved_jobs: string; alerts: string }> = {
  free: { sessions: "5",         resumes: "—",        saved_jobs: "—",        alerts: "—" },
  plus: { sessions: "20",        resumes: "5",         saved_jobs: "25",        alerts: "5" },
  pro:  { sessions: "Unlimited", resumes: "Unlimited", saved_jobs: "Unlimited", alerts: "Unlimited" },
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const QUALITY_STYLES: Record<ResumeSession["quality_label"], string> = {
  Excellent: "bg-teal-50 text-teal-700 border border-teal-200",
  Strong:    "bg-brand-50 text-brand-700 border border-brand-200",
  Good:      "bg-amber-50 text-amber-700 border border-amber-200",
  Reviewed:  "bg-slate-100 text-slate-500 border border-slate-200",
};

// ── Section header ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
      {children}
    </p>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value = 0, sub, comingSoon = false,
}: {
  icon: React.ReactNode;
  label: string;
  value?: number | string;
  sub?: string;
  comingSoon?: boolean;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-4 ${comingSoon ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${comingSoon ? "bg-slate-100 text-slate-400" : "bg-brand-50 text-brand-600"}`}>
          {icon}
        </span>
        {comingSoon && (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <FiLock className="w-3 h-3" /> Soon
          </span>
        )}
      </div>
      <div>
        <p className="text-3xl font-bold text-slate-900 leading-none">{comingSoon ? "—" : value}</p>
        <p className="text-sm text-slate-500 mt-1.5">{label}</p>
        {sub && !comingSoon && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Usage bar ─────────────────────────────────────────────────────────────────

function UsageRow({ label, used, limit }: { label: string; used: number; limit: string }) {
  const isUnlimited = limit === "Unlimited" || limit === "—";
  const notIncluded = limit === "—";
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / Number(limit)) * 100));
  const barColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-teal-500";

  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm font-medium text-slate-800 text-right tabular-nums">
        {notIncluded ? <span className="text-slate-400 text-xs">Not included</span> : isUnlimited ? <span className="text-teal-600 text-xs font-semibold">Unlimited</span> : `${used} / ${limit}`}
      </span>
      <div className="col-span-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        {!isUnlimited && !notIncluded && (
          <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
        )}
      </div>
    </div>
  );
}

// ── History row ───────────────────────────────────────────────────────────────

function HistoryRow({ session }: { session: ResumeSession }) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-slate-100 last:border-0 gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
          <FiClock className="w-3.5 h-3.5 text-slate-400" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">
            {session.target_role || <span className="text-slate-400 italic font-normal">No role specified</span>}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">{formatDateTime(session.created_at)}</p>
        </div>
      </div>
      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${QUALITY_STYLES[session.quality_label]}`}>
        {session.quality_label}
      </span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const { data: session, status } = useAuth();
  const tier = (session?.user?.tier ?? "free") as Tier;
  const [stats, setStats] = useState<AccountStats | null>(null);

  useEffect(() => {
    if (status === "authenticated") {
      getUserStats().then(setStats).catch(() => {});
    }
  }, [status]);

  if (status === "loading") return null;

  const limits = LIMITS[tier] ?? LIMITS.free;
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);

  return (
    <div className="space-y-8">

      {/* ── Page title ── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Overview</h1>
        <p className="text-sm text-slate-500 mt-1.5">Your activity and account at a glance.</p>
      </div>

      {/* ── Activity stats ── */}
      <section>
        <SectionLabel>Activity</SectionLabel>
        {stats ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={<FiFileText className="w-4 h-4" />}
              label="Resumes generated"
              value={stats.generated_count}
            />
            <StatCard
              icon={<FiBookmark className="w-4 h-4" />}
              label="Jobs saved"
              value={stats.saved_job_count}
            />
            <StatCard
              icon={<FiBell className="w-4 h-4" />}
              label="Active alerts"
              value={stats.active_alert_count}
              sub={stats.alert_count > stats.active_alert_count
                ? `${stats.alert_count} total`
                : undefined}
            />
            <StatCard
              icon={<FiBriefcase className="w-4 h-4" />}
              label="Jobs applied"
              comingSoon
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 h-32 animate-pulse" />
            ))}
          </div>
        )}
      </section>

      {/* ── Resume history ── */}
      <section>
        <SectionLabel>Resume History</SectionLabel>
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {!stats ? (
            <div className="p-6 space-y-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-7 h-7 bg-slate-100 rounded-lg animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-slate-100 rounded animate-pulse w-48" />
                    <div className="h-3 bg-slate-100 rounded animate-pulse w-32" />
                  </div>
                  <div className="h-5 w-16 bg-slate-100 rounded-full animate-pulse" />
                </div>
              ))}
            </div>
          ) : stats.recent_sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <FiFileText className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-700">No resumes generated yet</p>
              <p className="text-sm text-slate-400 mt-1">Start with the builder to see your history here.</p>
              <Link
                href="/builder/upload"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
              >
                Start tailoring <FiArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <div className="px-5">
              {stats.recent_sessions.map((s) => (
                <HistoryRow key={s.id} session={s} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Plan snapshot ── */}
      <section>
        <SectionLabel>Your Plan</SectionLabel>
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          {!stats ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-5 bg-slate-100 rounded w-36" />
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-3 bg-slate-100 rounded w-28" />
                  <div className="h-1.5 bg-slate-100 rounded-full" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2.5">
                  <span className="text-base font-bold text-slate-900">{tierLabel} Plan</span>
                  <span className="text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-100 rounded-full px-2.5 py-0.5">
                    Active
                  </span>
                </div>
                <Link
                  href="/settings/plan"
                  className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
                >
                  Manage plan <FiArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="space-y-5">
                <UsageRow label="Resume sessions"  used={stats.session_count}    limit={limits.sessions} />
                <UsageRow label="Saved resumes"    used={stats.resume_count}     limit={limits.resumes} />
                <UsageRow label="Saved jobs"       used={stats.saved_job_count}  limit={limits.saved_jobs} />
                <UsageRow label="Job alerts"       used={stats.alert_count}      limit={limits.alerts} />
              </div>
            </>
          )}
        </div>
      </section>

    </div>
  );
}
