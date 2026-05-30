"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { TIERS, type Tier } from "@/components/PricingTiers";
import { FiCheck, FiZap, FiMail } from "react-icons/fi";
import toast from "react-hot-toast";
import { SUPPORT_EMAIL } from "@/lib/config";
import { getPricing, detectCurrencyFromConfig } from "@/lib/tierConfig";

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
      {children}
    </p>
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
  // Match PricingTiers.tsx price style exactly
  return <p className="text-sm font-bold text-brand-600 mb-4">{price || "—"}</p>;
}

// ── Tier card — matches PricingTiers.tsx visual style ─────────────────────────

function TierCard({ tier, currentTier }: { tier: typeof TIERS[0]; currentTier: Tier }) {
  const isCurrent = tier.id === currentTier;
  const isUpgrade =
    ["free", "plus", "pro"].indexOf(tier.id) > ["free", "plus", "pro"].indexOf(currentTier);

  return (
    <div className={`relative flex flex-col rounded-2xl border-2 p-5 transition-all ${
      isCurrent
        ? "border-brand-500 bg-brand-50 shadow-sm"
        : tier.highlight
        ? "border-brand-300 bg-white shadow-md"
        : "border-slate-200 bg-white"
    }`}>
      {tier.highlight && !isCurrent && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold bg-brand-600 text-white px-3 py-0.5 rounded-full whitespace-nowrap">
          Most popular
        </span>
      )}
      {isCurrent && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold bg-teal-600 text-white px-3 py-0.5 rounded-full whitespace-nowrap">
          Your plan
        </span>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <span className="font-bold text-slate-900 text-base">{tier.name}</span>
        {isCurrent && <FiCheck className="w-4 h-4 text-teal-600" />}
      </div>

      <PlanPrice tierId={tier.id} />

      {/* Features */}
      <ul className="flex flex-col gap-2 flex-1 mb-5">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
            <FiCheck className="w-3.5 h-3.5 text-teal-500 mt-0.5 shrink-0" />
            {f}
          </li>
        ))}
      </ul>

      {/* CTA */}
      {isCurrent ? (
        <div className="w-full text-center text-sm font-medium text-slate-400 py-2 border border-slate-200 rounded-xl">
          Current plan
        </div>
      ) : isUpgrade ? (
        <button
          onClick={() => toast(`To upgrade, contact us at ${SUPPORT_EMAIL}`, { icon: "✉️", duration: 6000 })}
          className="w-full flex items-center justify-center gap-2 text-sm font-semibold rounded-xl py-2 px-4 bg-brand-600 text-white hover:bg-brand-700 transition-colors"
        >
          <FiZap className="w-3.5 h-3.5" />
          Upgrade to {tier.name}
        </button>
      ) : (
        <button
          onClick={() => toast(`To change your plan, contact ${SUPPORT_EMAIL}`, { icon: "✉️", duration: 6000 })}
          className="w-full flex items-center justify-center gap-2 text-sm font-medium rounded-xl py-2 px-4 border border-slate-300 text-slate-600 hover:border-brand-400 hover:text-brand-600 transition-colors"
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

  useEffect(() => {
    if (status === "authenticated" && update) {
      update();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Only block on the very first load — not on status flips caused by update()
  if (!session && status === "loading") return null;

  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);

  return (
    <div className="space-y-8">

      {/* ── Page title ── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Plan</h1>
        <p className="text-sm text-slate-500 mt-1.5">
          You are on the <span className="font-semibold text-slate-700">{tierLabel}</span> plan.
          Compare plans and upgrade when you&apos;re ready.
        </p>
      </div>

      {/* ── Plan comparison ── */}
      <section>
        <SectionLabel>Available Plans</SectionLabel>
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
