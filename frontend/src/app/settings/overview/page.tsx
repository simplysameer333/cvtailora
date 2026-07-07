"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import {
  listJobAlerts, toggleJobAlert, deleteJobAlert, type JobAlert,
} from "@/lib/api";
import { TIERS, buildFeatures, type Tier } from "@/components/PricingTiers";
import CreateAlertModal from "@/components/CreateAlertModal";
import {
  FiCreditCard, FiBell,
  FiCheck, FiZap, FiMail,
  FiToggleLeft, FiToggleRight, FiMapPin, FiPlusCircle,
  FiEdit2, FiTrash2, FiAlertTriangle,
} from "react-icons/fi";
import toast from "react-hot-toast";
import { SUPPORT_EMAIL } from "@/lib/config";
import { getPricing, detectCurrencyFromConfig, hasFeatureDynamic, getTierLimitDynamic } from "@/lib/tierConfig";
import { useTierConfigVersion } from "@/lib/useTierConfig";

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab = "plan" | "alerts";

// ── Shared helpers ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">{children}</p>;
}

function timeAgo(iso?: string | null) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

// ── Shared UI atoms ───────────────────────────────────────────────────────────

function PlanPrice({ tierId }: { tierId: string }) {
  // Re-run when the live MongoDB config loads so the price reflects the admin's
  // pricing rather than the pre-load fallback (config loads async post-render).
  const version = useTierConfigVersion();
  const [price, setPrice] = useState("");
  useEffect(() => {
    const map = getPricing();
    const cur = detectCurrencyFromConfig();
    const c = map[cur] || map[Object.keys(map)[0]];
    if (!c) return;
    setPrice(tierId === "free" ? "Free" : tierId === "plus" ? `${c.symbol}${c.plus} / mo` : `${c.symbol}${c.pro} / mo`);
  }, [tierId, version]);
  return <p className="text-sm font-bold text-brand-600 mb-4">{price || "—"}</p>;
}

function TierCard({ tier, currentTier }: { tier: typeof TIERS[0]; currentTier: Tier }) {
  const isCurrent = tier.id === currentTier;
  const isUpgrade = ["free", "plus", "pro"].indexOf(tier.id) > ["free", "plus", "pro"].indexOf(currentTier);
  return (
    <div className={`relative flex flex-col rounded-2xl border-2 p-5 transition-all ${
      isCurrent ? "border-brand-500 bg-brand-50 shadow-sm"
      : tier.highlight ? "border-brand-300 bg-white shadow-md"
      : "border-slate-200 bg-white"
    }`}>
      {tier.highlight && !isCurrent && <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold bg-brand-600 text-white px-3 py-0.5 rounded-full whitespace-nowrap">Most popular</span>}
      {isCurrent && <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold bg-teal-600 text-white px-3 py-0.5 rounded-full whitespace-nowrap">Your plan</span>}
      <div className="flex items-center justify-between mb-1">
        <span className="font-bold text-slate-900 text-base">{tier.name}</span>
        {isCurrent && <FiCheck className="w-4 h-4 text-teal-600" />}
      </div>
      <PlanPrice tierId={tier.id} />
      <ul className="flex flex-col gap-2 flex-1 mb-5">
        {buildFeatures(tier.id).map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
            <FiCheck className="w-3.5 h-3.5 text-teal-500 mt-0.5 shrink-0" />{f}
          </li>
        ))}
      </ul>
      {isCurrent ? (
        <div className="w-full text-center text-sm font-medium text-slate-400 py-2 border border-slate-200 rounded-xl">Current plan</div>
      ) : isUpgrade ? (
        <button onClick={() => toast(`To upgrade, contact us at ${SUPPORT_EMAIL}`, { icon: "✉️", duration: 6000 })}
          className="w-full flex items-center justify-center gap-2 text-sm font-semibold rounded-xl py-2 px-4 bg-brand-600 text-white hover:bg-brand-700 transition-colors">
          <FiZap className="w-3.5 h-3.5" /> Upgrade to {tier.name}
        </button>
      ) : (
        <button onClick={() => toast(`To change your plan, contact ${SUPPORT_EMAIL}`, { icon: "✉️", duration: 6000 })}
          className="w-full flex items-center justify-center gap-2 text-sm font-medium rounded-xl py-2 px-4 border border-slate-300 text-slate-600 hover:border-brand-400 hover:text-brand-600 transition-colors">
          <FiMail className="w-3.5 h-3.5" /> Contact support
        </button>
      )}
    </div>
  );
}

function AlertCard({ alert, onToggle, onEdit, onDelete }: {
  alert: JobAlert;
  onToggle: (id: string) => void;
  onEdit: (alert: JobAlert) => void;
  onDelete: (id: string) => void;
}) {
  const allTags = [...alert.query_tags, ...(alert.company ? [alert.company] : []), ...alert.location_tags];
  const lastSent = alert.last_sent_at ? timeAgo(alert.last_sent_at) : null;
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 p-5 flex items-start gap-4 transition-colors ${alert.is_active ? "hover:border-brand-300" : "opacity-60"}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${alert.is_active ? "bg-brand-50" : "bg-slate-100"}`}>
        <FiBell className={`w-5 h-5 ${alert.is_active ? "text-brand-600" : "text-slate-400"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-900 text-sm">{alert.name}</p>
            <p className="text-xs text-slate-400 mt-0.5">{lastSent ? `Last emailed ${lastSent}` : "No email sent yet"}</p>
          </div>
          <button onClick={() => onToggle(alert.id)} title={alert.is_active ? "Pause" : "Resume"}
            className="text-slate-400 hover:text-brand-600 transition shrink-0 mt-0.5">
            {alert.is_active ? <FiToggleRight className="w-5 h-5 text-brand-500" /> : <FiToggleLeft className="w-5 h-5" />}
          </button>
        </div>
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {alert.query_tags.map((t) => <span key={t} className="text-xs bg-brand-50 text-brand-700 rounded-full px-2.5 py-0.5 border border-brand-100">{t}</span>)}
            {alert.company && <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2.5 py-0.5">{alert.company}</span>}
            {alert.location_tags.map((t) => (
              <span key={t} className="text-xs bg-teal-50 text-teal-700 rounded-full px-2.5 py-0.5 border border-teal-100 flex items-center gap-1">
                <FiMapPin className="w-2.5 h-2.5" />{t}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 mt-2.5">
          <button onClick={() => onEdit(alert)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-brand-600 transition px-2 py-1 rounded-lg hover:bg-brand-50">
            <FiEdit2 className="w-3 h-3" /> Edit
          </button>
          <button onClick={() => onDelete(alert.id)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition px-2 py-1 rounded-lg hover:bg-red-50">
            <FiTrash2 className="w-3 h-3" /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tab panels ────────────────────────────────────────────────────────────────

function PlanTab({ tier }: { tier: Tier }) {
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Plan</h1>
        <p className="text-sm text-slate-500 mt-1.5">
          You are on the <span className="font-semibold text-slate-700">{tierLabel}</span> plan. Compare plans and upgrade when you&apos;re ready.
        </p>
      </div>
      <section>
        <SectionLabel>Available Plans</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {TIERS.map((t) => <TierCard key={t.id} tier={t} currentTier={tier} />)}
        </div>
        <p className="text-xs text-slate-400 text-center mt-5">
          Questions? <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-600 hover:underline">Get in touch</a>
        </p>
      </section>
    </div>
  );
}

function AlertsTab({ tier }: { tier: Tier }) {
  const hasAlerts = hasFeatureDynamic(tier, "job_alerts");
  const isFree = !hasAlerts;
  const [alerts, setAlerts] = useState<JobAlert[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<JobAlert | undefined>();

  useEffect(() => {
    if (isFree) return;
    listJobAlerts().then((data) => { setAlerts(data); setLoaded(true); }).catch(() => setLoaded(true));
  }, [isFree]);

  const plusAlertLimit = getTierLimitDynamic("plus", "job_alerts") ?? 5;
  const atLimit = tier === "plus" && alerts.length >= plusAlertLimit;

  async function handleToggle(id: string) {
    try {
      const { is_active } = await toggleJobAlert(id);
      setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, is_active } : a));
    } catch { toast.error("Failed to update alert."); }
  }

  async function handleDelete(id: string) {
    try {
      await deleteJobAlert(id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      toast.success("Alert deleted.");
    } catch { toast.error("Failed to delete alert."); }
  }

  function handleSaved(saved: JobAlert) {
    setAlerts((prev) => {
      const idx = prev.findIndex((a) => a.id === saved.id);
      return idx >= 0 ? prev.map((a) => (a.id === saved.id ? saved : a)) : [...prev, saved];
    });
    setModalOpen(false);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Alerts</h1>
        <p className="text-sm text-slate-500 mt-1.5">
          Manage your saved job searches. We&apos;ll email you daily when new matching jobs appear.
        </p>
      </div>

      {isFree ? (
        <div className="bg-white rounded-2xl border border-slate-200 text-center py-16 flex flex-col items-center gap-4 px-6">
          <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center">
            <FiBell className="w-7 h-7 text-brand-600" />
          </div>
          <div>
            <p className="text-base font-bold text-slate-900">Daily Job Alerts</p>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              Save your searches and receive a daily email digest with new matching jobs — available on Plus and Pro.
            </p>
          </div>
          <button onClick={() => {}} className="btn-primary text-sm px-6 py-2">
            Upgrade to Plus →
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-slate-700">
                {tier === "plus" ? `${alerts.length} / ${plusAlertLimit} alerts used` : `${alerts.length} alert${alerts.length !== 1 ? "s" : ""}`}
              </p>
              {atLimit && <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 rounded-full px-2 py-0.5">Limit reached</span>}
            </div>
            <button
              onClick={() => { setEditing(undefined); setModalOpen(true); }}
              disabled={atLimit}
              className="btn-primary text-sm gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiPlusCircle className="w-4 h-4" /> New Alert
            </button>
          </div>

          {atLimit && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
              <FiAlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-amber-700">
                You&apos;ve reached the Plus limit of {plusAlertLimit} alerts. Upgrade to Pro for unlimited alerts.
              </span>
            </div>
          )}

          {!loaded ? (
            <div className="flex flex-col gap-3">
              {[0,1].map((i) => (
                <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start gap-4 animate-pulse">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 shrink-0" />
                  <div className="flex-1 space-y-2"><div className="h-4 bg-slate-100 rounded w-1/3" /><div className="h-3 bg-slate-100 rounded w-1/4" /><div className="flex gap-1.5 mt-1"><div className="h-5 w-16 bg-slate-100 rounded-full" /><div className="h-5 w-20 bg-slate-100 rounded-full" /></div></div>
                </div>
              ))}
            </div>
          ) : alerts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center py-16 gap-3 text-center">
              <FiBell className="w-8 h-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-700">No alerts yet</p>
              <p className="text-xs text-slate-400 max-w-xs">
                Go to <Link href="/jobs" className="text-brand-600 hover:underline">Find Jobs</Link>, search for roles, and save a search as a daily alert.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {alerts.map((alert) => (
                <AlertCard key={alert.id} alert={alert} onToggle={handleToggle}
                  onEdit={(a) => { setEditing(a); setModalOpen(true); }} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </>
      )}

      <CreateAlertModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        editAlert={editing}
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const NAV_ITEMS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "plan",     label: "Plan",     icon: FiCreditCard },
  { id: "alerts",   label: "Alerts",   icon: FiBell },
];

export default function SettingsPage() {
  const { data: session, status } = useAuth();
  const tier = (session?.user?.tier ?? "free") as Tier;
  const [activeTab, setActiveTab] = useState<Tab>("plan");

  if (status === "loading") return null;

  const user = session?.user;
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
  const initials = user?.name
    ? user.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex-1">

      {/* ── Mobile tab bar ── */}
      <div className="md:hidden bg-white border-b border-slate-200 px-4 overflow-x-auto">
        <div className="flex gap-1 py-1">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === id ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
              }`}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div className="w-full px-0 sm:px-2 py-4">
        <div className="flex gap-7 items-start">

          {/* ── Sidebar ── */}
          <aside className="w-56 shrink-0 hidden md:flex flex-col gap-4">

            {/* User card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm shrink-0 select-none">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate leading-snug">{user?.name || "Account"}</p>
                  <p className="text-xs text-slate-400 break-all leading-snug">{user?.email}</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-400">Current plan</span>
                <span className="text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-100 rounded-full px-2.5 py-0.5">{tierLabel}</span>
              </div>
            </div>

            {/* Vertical tabs */}
            <nav className="bg-white rounded-2xl border border-slate-200 p-2 flex flex-col gap-0.5">
              {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setActiveTab(id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                    activeTab === id ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}>
                  <Icon className={`w-4 h-4 shrink-0 ${activeTab === id ? "text-brand-600" : "text-slate-400"}`} />
                  {label}
                </button>
              ))}
            </nav>
          </aside>

          {/* ── Content ── */}
          <main className="flex-1 min-w-0">
            {activeTab === "plan"     && <PlanTab tier={tier} />}
            {activeTab === "alerts"   && <AlertsTab tier={tier} />}
          </main>

        </div>
      </div>
    </div>
  );
}
