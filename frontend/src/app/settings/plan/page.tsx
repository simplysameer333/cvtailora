"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { getUserStats, type AccountStats } from "@/lib/api";
import { TIERS, type Tier } from "@/components/PricingTiers";
import { FiCheck, FiZap, FiMail } from "react-icons/fi";
import toast from "react-hot-toast";
import { SUPPORT_EMAIL } from "@/lib/config";
import { getPricing, detectCurrencyFromConfig } from "@/lib/tierConfig";

// ── Helpers ───────────────────────────────────────────────────────────────────

const LIMITS: Record<string, { sessions: string; resumes: string; saved_jobs: string; alerts: string }> = {
  free: { sessions: "5",         resumes: "—",        saved_jobs: "—",        alerts: "—" },
  plus: { sessions: "20",        resumes: "5",         saved_jobs: "25",        alerts: "5" },
  pro:  { sessions: "Unlimited", resumes: "Unlimited", saved_jobs: "Unlimited", alerts: "Unlimited" },
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
      {children}
    </p>
  );
}

// ── Usage bar ─────────────────────────────────────────────────────────────────

function UsageRow({ label, used, limit }: { label: string; used: number; limit: string }) {
  const isUnlimited = limit === "Unlimited";
  const notIncluded = limit === "—";
  const pct = (isUnlimited || notIncluded) ? 0 : Math.min(100, Math.round((used / Number(limit)) * 100));
  const barColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-teal-500";

  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm font-medium text-right tabular-nums">
        {notIncluded
          ? <span className="text-slate-400 text-xs">Not included</span>
          : isUnlimited
          ? <span className="text-teal-600 text-xs font-semibold">Unlimited</span>
          : <span className="text-slate-800">{used} <span className="text-slate-400 font-normal">/ {limit}</span></span>
        }
      </span>
      <div className="col-span-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        {!isUnlimited && !notIncluded && (
          <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
        )}
      </div>
    </div>
  );
}

// ── Dynamic price ─────────────────────────────────────────────────────────────

function PlanPrice({ tierId }: { tierId: string }) {
  const [price, setPrice] = useState<string>("");
  useEffect(() => {
    const map = getPricing();
    const cur = detectCurrencyFromConfig();
    const c = map[cur] || map["USD"] || { symbol: "$", plus: 9, pro: 19 };
    setPrice(
      tierId === "free" ? "Free"
      : tierId === "plus" ? `${c.symbol}${c.plus} / mo`
      : `${c.symbol}${c.pro} / mo`
    );
  }, [tierId]);
  return (
    <span className="text-2xl font-bold text-slate-900 leading-none">
      {price || "—"}
    </span>
  );
}

// ── Tier card ─────────────────────────────────────────────────────────────────

function TierCard({ tier, currentTier }: { tier: typeof TIERS[0]; currentTier: Tier }) {
  const isCurrent = tier.id === currentTier;
  const isUpgrade = ["free", "plus", "pro"].indexOf(tier.id) > ["free", "plus", "pro"].indexOf(currentTier);

  return (
    <div className={`relative flex flex-col rounded-2xl border-2 p-6 transition-all ${
      isCurrent
        ? "border-brand-400 bg-brand-50"
        : tier.highlight
        ? "border-brand-200 bg-white shadow-sm"
        : "border-slate-200 bg-white"
    }`}>
      {tier.highlight && !isCurrent && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold bg-brand-600 text-white px-3 py-1 rounded-full whitespace-nowrap shadow-sm">
          Most popular
        </span>
      )}
      {isCurrent && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold bg-teal-600 text-white px-3 py-1 rounded-full whitespace-nowrap shadow-sm">
          Your plan
        </span>
      )}

      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-base font-bold text-slate-900">{tier.name}</span>
          {isCurrent && <FiCheck className="w-4 h-4 text-teal-600" />}
        </div>
        <PlanPrice tierId={tier.id} />
        {tier.id !== "free" && (
          <p className="text-xs text-slate-400 mt-1">per month</p>
        )}
      </div>

      <div className="w-full h-px bg-slate-100 mb-4" />

      {/* Features */}
      <ul className="flex flex-col gap-2.5 flex-1 mb-6">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm text-slate-600">
            <FiCheck className="w-3.5 h-3.5 text-teal-500 mt-0.5 shrink-0" />
            {f}
          </li>
        ))}
      </ul>

      {/* CTA */}
      {isCurrent ? (
        <div className="w-full text-center text-sm font-medium text-slate-400 py-2.5 border border-slate-200 rounded-xl bg-white">
          Current plan
        </div>
      ) : isUpgrade ? (
        <button
          onClick={() => toast(`To upgrade, contact us at ${SUPPORT_EMAIL}`, { icon: "✉️", duration: 6000 })}
          className="w-full flex items-center justify-center gap-2 text-sm font-semibold rounded-xl py-2.5 px-4 bg-brand-600 text-white hover:bg-brand-700 transition-colors"
        >
          <FiZap className="w-3.5 h-3.5" />
          Upgrade to {tier.name}
        </button>
      ) : (
        <button
          onClick={() => toast(`To change your plan, contact ${SUPPORT_EMAIL}`, { icon: "✉️", duration: 6000 })}
          className="w-full flex items-center justify-center gap-2 text-sm font-medium rounded-xl py-2.5 px-4 border border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-600 transition-colors"
        >
          <FiMail className="w-3.5 h-3.5" />
          Contact support
        </button>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PlanPage() {
  const { data: session, status, update } = useAuth();
  const tier = (session?.user?.tier ?? "free") as Tier;
  const [stats, setStats] = useState<AccountStats | null>(null);

  useEffect(() => {
    if (status === "authenticated" && update) {
      update();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

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
        <h1 className="text-2xl font-bold text-slate-900">Plan &amp; Usage</h1>
        <p className="text-sm text-slate-500 mt-1.5">
          Monitor your usage and manage your subscription.
        </p>
      </div>

      {/* ── Current plan usage ── */}
      <section>
        <SectionLabel>Current Plan</SectionLabel>
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          {!stats ? (
            <div className="space-y-5 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="h-5 bg-slate-100 rounded w-32" />
                <div className="h-5 bg-slate-100 rounded-full w-24" />
              </div>
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
                <span className="text-xs text-slate-400">Usage this period</span>
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

      {/* ── All plans ── */}
      <section>
        <SectionLabel>All Plans</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {TIERS.map((t) => (
            <TierCard key={t.id} tier={t} currentTier={tier} />
          ))}
        </div>
        <p className="text-xs text-slate-400 text-center mt-5">
          Questions about your plan?{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-600 hover:underline">
            Get in touch
          </a>
        </p>
      </section>

    </div>
  );
}
