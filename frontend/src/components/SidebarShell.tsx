"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  FiUser, FiBriefcase, FiEdit2, FiShield, FiSettings,
  FiCheckSquare, FiMail, FiBookOpen, FiChevronsLeft, FiChevronsRight, FiZap, FiLock, FiBarChart2,
} from "react-icons/fi";
import Navbar from "./Navbar";
import Footer from "./Footer";
import BottomNav from "./BottomNav";
import { useAuth } from "@/lib/useAuth";
import { getAccountUsage, type AccountUsage } from "@/lib/api";
import { useDevContext, type Tier } from "@/providers/DevProvider";

const DEV = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";
const COLLAPSE_KEY = "tailormycv_sidebar_collapsed";
// Matches PricingTiers: rough cost of one full tailoring run, for "~N left" copy
const EST_TAILOR_COST_CENTS = 15;

// authOnly items render disabled (locked) for signed-out visitors — visible but
// clearly not available, per UX decision. CV Score is the free no-login tool.
const NAV = [
  { href: "/cv-score",       icon: FiCheckSquare, label: "CV Score",       authOnly: false },
  { href: "/builder/upload", icon: FiEdit2,       label: "CV Builder",     authOnly: true, match: "/builder" },
  { href: "/cover-letter",   icon: FiMail,        label: "Cover Letter",   authOnly: true },
  { href: "/interview-prep", icon: FiBookOpen,    label: "Interview Prep", authOnly: true },
  { href: "/jobs",           icon: FiBriefcase,   label: "Find Jobs",      authOnly: true },
];

const ACCOUNT_NAV = [
  { href: "/profile",           icon: FiUser,      label: "My Profile", authOnly: true },
  { href: "/analytics",         icon: FiBarChart2, label: "Analytics",  authOnly: true },
  { href: "/settings/overview", icon: FiSettings,  label: "Settings",   authOnly: true, match: "/settings" },
];

function DevTierSwitcher({ collapsed }: { collapsed: boolean }) {
  const { tier, setTier } = useDevContext();
  if (collapsed) return null;
  return (
    <div className="px-3 py-2 border-t border-white/10">
      <p className="text-[11px] text-white/40 mb-1.5">Dev — switch plan</p>
      <div className="flex gap-1">
        {(["free", "plus", "pro"] as Tier[]).map((t) => (
          <button
            key={t}
            onClick={() => setTier(t)}
            className={`flex-1 rounded-md px-1.5 py-1 text-xs font-semibold capitalize transition ${
              tier === t ? "bg-teal-500 text-white" : "text-white/50 hover:bg-white/10"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

function QuotaWidget({ collapsed }: { collapsed: boolean }) {
  const [usage, setUsage] = useState<AccountUsage | null>(null);

  useEffect(() => {
    getAccountUsage().then(setUsage).catch(() => {});
  }, []);

  if (!usage || usage.daily_cap_cents === null || collapsed) return null;

  const pct = Math.min(100, Math.round((usage.daily_used_cents / Math.max(1, usage.daily_cap_cents)) * 100));
  const leftCents = Math.max(0, usage.daily_cap_cents - usage.daily_used_cents);
  const tailorsLeft = Math.floor(leftCents / EST_TAILOR_COST_CENTS);

  return (
    <div className="mx-3 mb-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
          <FiZap className="w-3.5 h-3.5 text-teal-300" />
          Daily AI budget
        </span>
        <span className="text-[11px] text-white/50">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-amber-400" : "bg-teal-400"}`}
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-white/50">
        {tailorsLeft > 0 ? `~${tailorsLeft} tailored ${tailorsLeft === 1 ? "resume" : "resumes"} left today` : "Daily budget used — resets 00:00 UTC"}
      </p>
    </div>
  );
}

export default function SidebarShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const { data: session, status } = useAuth();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  const toggle = () => {
    setCollapsed((v) => {
      localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1");
      return !v;
    });
  };

  const user = session?.user;
  const width = collapsed ? "lg:w-[72px]" : "lg:w-64";
  const pad = collapsed ? "lg:pl-[72px]" : "lg:pl-64";

  const renderLink = ({ href, icon: Icon, label, match, authOnly }: {
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    match?: string;
    authOnly?: boolean;
  }) => {
    const active = pathname.startsWith(match ?? href);
    const locked = !!authOnly && status !== "authenticated";

    if (locked) {
      // Visible but disabled — clicking sends the visitor to sign-in
      return (
        <Link
          key={href}
          href="/auth/login"
          title={`${label} — sign in to use`}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium border-l-2 border-transparent text-white/30 hover:text-white/50 transition ${collapsed ? "justify-center px-0" : ""}`}
        >
          <Icon className="w-[18px] h-[18px] shrink-0" />
          {!collapsed && <span className="truncate flex-1">{label}</span>}
          {!collapsed && <FiLock className="w-3.5 h-3.5 shrink-0" />}
        </Link>
      );
    }

    return (
      <Link
        key={href}
        href={href}
        title={label}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
          active
            ? "bg-teal-500/20 text-white border-l-2 border-teal-400"
            : "text-white/60 hover:bg-white/10 hover:text-white border-l-2 border-transparent"
        } ${collapsed ? "justify-center px-0" : ""}`}
      >
        <Icon className="w-[18px] h-[18px] shrink-0" />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Common header shared with marketing pages */}
      <Navbar />

      <div className="flex-1 flex">
        {/* ── Desktop sidebar — starts below the sticky header ── */}
        <aside
          className={`hidden lg:flex fixed top-16 bottom-0 left-0 z-40 flex-col bg-brand-900 transition-all duration-200 ${width}`}
        >
          <div className={`flex items-center h-12 border-b border-white/10 ${collapsed ? "justify-center" : "px-3 justify-end"}`}>
            <button
              onClick={toggle}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition"
            >
              {collapsed ? <FiChevronsRight className="w-4 h-4" /> : <FiChevronsLeft className="w-4 h-4" />}
            </button>
          </div>

          <nav className={`flex-1 overflow-y-auto py-4 space-y-1 ${collapsed ? "px-2" : "px-3"}`}>
            {!collapsed && <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/30">Tools</p>}
            {NAV.map(renderLink)}
            {!collapsed && <p className="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/30">Account</p>}
            {collapsed && <div className="h-4" />}
            {ACCOUNT_NAV.map(renderLink)}
            {user?.is_superadmin && renderLink({ href: "/admin", icon: FiShield, label: "Admin" })}
          </nav>

          {status === "authenticated" && <QuotaWidget collapsed={collapsed} />}
          {DEV && <DevTierSwitcher collapsed={collapsed} />}
        </aside>

        {/* ── Content + slim app footer ── */}
        <div className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${pad}`}>
          <main className="flex-1 px-4 sm:px-8 py-6 lg:py-8 pb-safe sm:pb-8">
            {/* Content anchors to the sidebar and fills the viewport — no centering cap */}
            {title && <h1 className="text-2xl font-bold text-slate-900 mb-1">{title}</h1>}
            {children}
          </main>
          {/* Same footer as marketing pages — one footer everywhere */}
          <Footer />
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
