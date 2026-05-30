"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { getUserStats, type AccountStats } from "@/lib/api";
import { type Tier } from "@/components/PricingTiers";
import {
  FiFileText, FiBookmark, FiBell, FiBriefcase,
  FiLock, FiArrowRight, FiCreditCard, FiBarChart2,
} from "react-icons/fi";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Quick-link card ───────────────────────────────────────────────────────────

function QuickLinkCard({
  href, icon, title, description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4 hover:border-brand-300 hover:shadow-sm transition-all"
    >
      <span className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors shrink-0">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
      <FiArrowRight className="w-4 h-4 text-slate-300 group-hover:text-brand-500 transition-colors shrink-0" />
    </Link>
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

  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);

  return (
    <div className="space-y-8">

      {/* ── Page title ── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Overview</h1>
        <p className="text-sm text-slate-500 mt-1.5">
          Welcome back{session?.user?.name ? `, ${session.user.name.split(" ")[0]}` : ""}. Here&apos;s a snapshot of your account.
        </p>
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

      {/* ── Quick links ── */}
      <section>
        <SectionLabel>Account</SectionLabel>
        <div className="flex flex-col gap-3">
          <QuickLinkCard
            href="/settings/plan"
            icon={<FiCreditCard className="w-4 h-4" />}
            title="Plan"
            description={`You are on the ${tierLabel} plan. View available plans and upgrade options.`}
          />
          <QuickLinkCard
            href="/settings/usage"
            icon={<FiBarChart2 className="w-4 h-4" />}
            title="Usage"
            description="See how much of your plan allowance you have used and your resume history."
          />
        </div>
      </section>

    </div>
  );
}
