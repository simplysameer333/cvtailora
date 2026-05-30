"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { getUserStats, type AccountStats, type ResumeSession } from "@/lib/api";
import { type Tier } from "@/components/PricingTiers";
import { FiFileText, FiClock, FiArrowRight } from "react-icons/fi";

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
      {children}
    </p>
  );
}

// ── Usage row ─────────────────────────────────────────────────────────────────

function UsageRow({
  label, description, used, limit,
}: {
  label: string;
  description: string;
  used: number;
  limit: string;
}) {
  const isUnlimited = limit === "Unlimited";
  const notIncluded = limit === "—";
  const pct = (isUnlimited || notIncluded) ? 0 : Math.min(100, Math.round((used / Number(limit)) * 100));
  const barColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-teal-500";

  return (
    <div className="py-5 border-b border-slate-100 last:border-0">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">{label}</p>
          <p className="text-xs text-slate-400 mt-0.5">{description}</p>
        </div>
        <div className="text-right shrink-0">
          {notIncluded ? (
            <p className="text-xs text-slate-400 font-medium">Not on your plan</p>
          ) : isUnlimited ? (
            <p className="text-sm font-bold text-teal-600">{used} <span className="text-xs font-normal text-teal-500">/ ∞</span></p>
          ) : (
            <>
              <p className="text-sm font-bold text-slate-900 tabular-nums">
                {used} <span className="text-slate-400 font-normal text-xs">/ {limit}</span>
              </p>
              <p className="text-xs text-slate-400 mt-0.5">{limit === "0" ? "0" : Math.max(0, Number(limit) - used)} remaining</p>
            </>
          )}
        </div>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        {!isUnlimited && !notIncluded && (
          <div
            className={`h-full ${barColor} rounded-full transition-all`}
            style={{ width: `${pct}%` }}
          />
        )}
        {isUnlimited && (
          <div className="h-full bg-teal-100 rounded-full w-full" />
        )}
        {notIncluded && (
          <div className="h-full bg-slate-100 rounded-full w-full" />
        )}
      </div>
      {!isUnlimited && !notIncluded && (
        <p className="text-xs text-slate-400 mt-1.5 text-right">{pct}% used</p>
      )}
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
            {session.target_role || (
              <span className="text-slate-400 italic font-normal">No role specified</span>
            )}
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

export default function UsagePage() {
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

  return (
    <div className="space-y-8">

      {/* ── Page title ── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Usage</h1>
        <p className="text-sm text-slate-500 mt-1.5">
          How much of your plan allowance you have used, and your resume history.
        </p>
      </div>

      {/* ── Plan allowance ── */}
      <section>
        <SectionLabel>Plan Allowance</SectionLabel>
        <div className="bg-white rounded-2xl border border-slate-200 px-6">
          {!stats ? (
            <div className="py-6 space-y-6">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="space-y-2 animate-pulse">
                  <div className="flex justify-between">
                    <div className="h-4 bg-slate-100 rounded w-32" />
                    <div className="h-4 bg-slate-100 rounded w-16" />
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <UsageRow
                label="Resume Sessions"
                description="Builder sessions started, including incomplete ones"
                used={stats.session_count}
                limit={limits.sessions}
              />
              <UsageRow
                label="Saved Resumes"
                description="Tailored resumes saved to your Resume Library"
                used={stats.resume_count}
                limit={limits.resumes}
              />
              <UsageRow
                label="Saved Jobs"
                description="Job listings bookmarked from the Find Jobs page"
                used={stats.saved_job_count}
                limit={limits.saved_jobs}
              />
              <UsageRow
                label="Job Alerts"
                description="Active saved searches that send you daily email digests"
                used={stats.alert_count}
                limit={limits.alerts}
              />
            </>
          )}
        </div>
      </section>

      {/* ── Resume history ── */}
      <section>
        <SectionLabel>Resume History</SectionLabel>
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {!stats ? (
            <div className="p-6 space-y-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-7 h-7 bg-slate-100 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-slate-100 rounded w-48" />
                    <div className="h-3 bg-slate-100 rounded w-32" />
                  </div>
                  <div className="h-5 w-16 bg-slate-100 rounded-full" />
                </div>
              ))}
            </div>
          ) : stats.recent_sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <FiFileText className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-700">No resumes generated yet</p>
              <p className="text-sm text-slate-400 mt-1">
                Complete the 6-step builder to see your history here.
              </p>
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

    </div>
  );
}
