"use client";
// Admin dashboard shell — nav groups, per-tab data cache and auth guard.
// Each tab's UI lives in components/admin/<Name>Tab.tsx (split 2026-07-13,
// SOLID/no-very-large-files); this file only orchestrates them.
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import {
  adminListUsers, adminGetUserStats, adminListAudit, adminListPrompts,
  adminListProfessions, adminGetAgentMemory,
  AdminUser, UserStats, AuditPage, PromptOverride, AdminProfession, AgentMemory,
} from "@/lib/api";
import {
  FiUsers, FiActivity, FiCpu, FiBriefcase, FiClock,
  FiGrid, FiSliders, FiBell, FiShield,
} from "react-icons/fi";
import PageBanner from "@/components/PageBanner";
import SchedulerRunsTab from "@/components/admin/SchedulerRunsTab";
import UsersTab from "@/components/admin/UsersTab";
import AuditTab from "@/components/admin/AuditTab";
import AgentMemoryTab from "@/components/admin/AgentMemoryTab";
import PromptsTab from "@/components/admin/PromptsTab";
import ProfessionsTab from "@/components/admin/ProfessionsTab";
import ManageTemplatesTab from "@/components/admin/ManageTemplatesTab";
import SystemTab from "@/components/admin/SystemTab";
import TierConfigTab from "@/components/admin/TierConfigTab";

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab = "users" | "audit" | "scheduler" | "agent_memory" | "prompts" | "cv_score_prompts" | "tools_prompts" | "professions" | "manage_templates" | "tier_config" | "system";

interface CacheEntry<T> {
  data: T;
  fetchedAt: Date;
}

interface PageCache {
  users?: CacheEntry<AdminUser[]>;
  audit?: CacheEntry<AuditPage>;
  agent_memory?: CacheEntry<AgentMemory[]>;
  prompts?: CacheEntry<PromptOverride[]>;
  professions?: CacheEntry<AdminProfession[]>;
}

// Per-tab display metadata (label + icon), keyed by Tab id.
const TAB_META: Record<Tab, { label: string; icon: React.ReactNode }> = {
  users:            { label: "Users",         icon: <FiUsers className="w-4 h-4" /> },
  audit:            { label: "Audit Log",     icon: <FiActivity className="w-4 h-4" /> },
  scheduler:        { label: "Alert Scheduler", icon: <FiClock className="w-4 h-4" /> },
  agent_memory:     { label: "Agent Memory",  icon: <FiCpu className="w-4 h-4" /> },
  prompts:          { label: "CV Builder Prompts", icon: <FiCpu className="w-4 h-4" /> },
  cv_score_prompts: { label: "CV Score Prompts",   icon: <FiActivity className="w-4 h-4" /> },
  tools_prompts:    { label: "AI Tools Prompts",   icon: <FiCpu className="w-4 h-4" /> },
  professions:      { label: "Professions",   icon: <FiBriefcase className="w-4 h-4" /> },
  manage_templates: { label: "Resume Templates", icon: <FiGrid className="w-4 h-4" /> },
  tier_config:      { label: "Tiers & Pricing", icon: <FiSliders className="w-4 h-4" /> },
  system:           { label: "System",        icon: <FiBell className="w-4 h-4" /> },
};

// Top-level groups arranged by feature; each renders its tabs as sub-sections.
const GROUPS: { id: string; label: string; icon: React.ReactNode; tabs: Tab[] }[] = [
  { id: "people",  label: "User Management",     icon: <FiUsers className="w-4 h-4" />,   tabs: ["users", "audit", "scheduler", "agent_memory"] },
  { id: "content", label: "Prompts & Templates", icon: <FiCpu className="w-4 h-4" />,     tabs: ["prompts", "cv_score_prompts", "tools_prompts", "professions", "manage_templates"] },
  { id: "config",  label: "Feature Controls",    icon: <FiSliders className="w-4 h-4" />, tabs: ["tier_config", "system"] },
];

export default function AdminPage() {
  const { data: session, status } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("users");

  // ── Cache (useRef — writes don't trigger re-renders) ───────────────────────
  const cache = useRef<PageCache>({});
  const userStatsCache = useRef<Map<string, UserStats>>(new Map());

  // ── Displayed state (drives the UI) ───────────────────────────────────────
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [auditData, setAuditData] = useState<AuditPage | null>(null);
  const [agentMemory, setAgentMemory] = useState<AgentMemory[]>([]);
  const [prompts, setPrompts] = useState<PromptOverride[]>([]);
  const [professions, setProfessions] = useState<AdminProfession[]>([]);
  const [loading, setLoading] = useState<Record<Tab, boolean>>({ users: false, audit: false, scheduler: false, agent_memory: false, prompts: false, cv_score_prompts: false, tools_prompts: false, professions: false, manage_templates: false, tier_config: false, system: false });
  const [fetchedAt, setFetchedAt] = useState<Record<Tab, Date | null>>({ users: null, audit: null, scheduler: null, agent_memory: null, prompts: null, cv_score_prompts: null, tools_prompts: null, professions: null, manage_templates: null, tier_config: null, system: null });

  function setLoad(t: Tab, v: boolean) { setLoading(prev => ({ ...prev, [t]: v })); }
  function setFetched(t: Tab, d: Date) { setFetchedAt(prev => ({ ...prev, [t]: d })); }

  // ── Fetchers ───────────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async (force = false) => {
    if (!force && cache.current.users) {
      setUsers(cache.current.users.data);
      setFetchedAt(prev => ({ ...prev, users: cache.current.users!.fetchedAt }));
      return;
    }
    setLoad("users", true);
    try {
      const data = await adminListUsers();
      const entry = { data, fetchedAt: new Date() };
      cache.current.users = entry;
      setUsers(data);
      setFetched("users", entry.fetchedAt);
    } finally { setLoad("users", false); }
  }, []);

  const fetchAudit = useCallback(async (force = false) => {
    if (!force && cache.current.audit) {
      setAuditData(cache.current.audit.data);
      setFetchedAt(prev => ({ ...prev, audit: cache.current.audit!.fetchedAt }));
      return;
    }
    setLoad("audit", true);
    try {
      const data = await adminListAudit(1, 50);
      const entry = { data, fetchedAt: new Date() };
      cache.current.audit = entry;
      setAuditData(data);
      setFetched("audit", entry.fetchedAt);
    } finally { setLoad("audit", false); }
  }, []);

  const fetchAgentMemory = useCallback(async (force = false) => {
    if (!force && cache.current.agent_memory) {
      setAgentMemory(cache.current.agent_memory.data);
      setFetchedAt(prev => ({ ...prev, agent_memory: cache.current.agent_memory!.fetchedAt }));
      return;
    }
    setLoad("agent_memory", true);
    try {
      const data = await adminGetAgentMemory();
      const entry = { data, fetchedAt: new Date() };
      cache.current.agent_memory = entry;
      setAgentMemory(data);
      setFetched("agent_memory", entry.fetchedAt);
    } finally { setLoad("agent_memory", false); }
  }, []);

  const fetchPrompts = useCallback(async (force = false) => {
    if (!force && cache.current.prompts) {
      setPrompts(cache.current.prompts.data);
      setFetchedAt(prev => ({ ...prev, prompts: cache.current.prompts!.fetchedAt }));
      return;
    }
    setLoad("prompts", true);
    try {
      const data = await adminListPrompts();
      const entry = { data, fetchedAt: new Date() };
      cache.current.prompts = entry;
      setPrompts(data);
      setFetched("prompts", entry.fetchedAt);
    } finally { setLoad("prompts", false); }
  }, []);

  const fetchProfessions = useCallback(async (force = false) => {
    if (!force && cache.current.professions) {
      setProfessions(cache.current.professions.data);
      setFetchedAt(prev => ({ ...prev, professions: cache.current.professions!.fetchedAt }));
      return;
    }
    setLoad("professions", true);
    try {
      const data = await adminListProfessions();
      const entry = { data, fetchedAt: new Date() };
      cache.current.professions = entry;
      setProfessions(data);
      setFetched("professions", entry.fetchedAt);
    } finally { setLoad("professions", false); }
  }, []);

  // Per-user stats — fetched on expand, cached in a Map
  const fetchUserStats = useCallback(async (userId: string) => {
    if (userStatsCache.current.has(userId)) return;
    try {
      const stats = await adminGetUserStats(userId);
      userStatsCache.current.set(userId, stats);
      // Force a re-render so the expanded row shows the stats
      setUsers(prev => [...prev]);
    } catch { /* silently ignore */ }
  }, []);

  // Refresh handlers — clear cache entry then re-fetch
  function refreshTab(t: Tab) {
    if (t === "users")       { cache.current.users       = undefined; fetchUsers(true); }
    if (t === "audit")       { cache.current.audit       = undefined; fetchAudit(true); }
    if (t === "agent_memory") { cache.current.agent_memory = undefined; fetchAgentMemory(true); }
    if (t === "prompts" || t === "cv_score_prompts" || t === "tools_prompts") { cache.current.prompts = undefined; fetchPrompts(true); }
    if (t === "professions") { cache.current.professions = undefined; fetchProfessions(true); }
  }

  function handleTabSelect(t: Tab) {
    setTab(t);
    if (t === "users")       fetchUsers();
    if (t === "audit")       fetchAudit();
    if (t === "agent_memory") fetchAgentMemory();
    if (t === "prompts" || t === "cv_score_prompts" || t === "tools_prompts") fetchPrompts();
    if (t === "professions") fetchProfessions();
  }

  // Fetch users only after auth is confirmed — prevents blank tab on first load
  // (the initial render fires before NextAuth sets the Bearer token on the axios instance)
  useEffect(() => {
    if (status === "authenticated" && session?.user?.is_superadmin) {
      fetchUsers();
    }
  }, [status, session?.user?.is_superadmin, fetchUsers]);

  // Auth guard
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/auth/login");
    if (status === "authenticated" && !session?.user?.is_superadmin) router.replace("/");
  }, [status, session, router]);

  if (status === "loading" || !session?.user?.is_superadmin) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Checking access…</div>;
  }

  return (
    <main className="bg-slate-50">
      <div className="w-full px-0 sm:px-2 py-4">
        <div className="mb-6">
          <PageBanner
            icon={FiShield}
            title="Admin Dashboard"
            subtitle="Manage users, prompts, templates, professions and system configuration."
          />
        </div>

        {/* Top-level group bar (by feature) */}
        <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-1 mb-3 w-fit">
          {GROUPS.map(g => {
            const isActive = g.tabs.includes(tab);
            return (
              <button
                key={g.id}
                onClick={() => handleTabSelect(g.tabs[0])}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
                  isActive ? "bg-brand-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {g.icon}
                {g.label}
              </button>
            );
          })}
        </div>

        {/* Sub-section bar (tabs within the active group) */}
        {(() => {
          const activeGroup = GROUPS.find(g => g.tabs.includes(tab)) ?? GROUPS[0];
          if (activeGroup.tabs.length < 2) return <div className="mb-6" />;
          return (
            <div className="flex gap-1 mb-6 flex-wrap">
              {activeGroup.tabs.map(tid => (
                <button
                  key={tid}
                  onClick={() => handleTabSelect(tid)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                    tab === tid
                      ? "bg-brand-50 text-brand-700 border-brand-200"
                      : "text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700"
                  }`}
                >
                  {TAB_META[tid].icon}
                  {TAB_META[tid].label}
                  {fetchedAt[tid] && tab !== tid && (
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400" title="Cached" />
                  )}
                </button>
              ))}
            </div>
          );
        })()}

        {/* Tab content */}
        <div>
          {tab === "users" && (
            <UsersTab
              users={users}
              loading={loading.users}
              fetchedAt={fetchedAt.users}
              onRefresh={() => refreshTab("users")}
              statsCache={userStatsCache.current}
              fetchStats={fetchUserStats}
            />
          )}
          {tab === "audit" && (
            <AuditTab
              initialData={auditData}
              loading={loading.audit}
              fetchedAt={fetchedAt.audit}
              onRefresh={() => refreshTab("audit")}
            />
          )}
          {tab === "scheduler" && <SchedulerRunsTab />}
          {tab === "agent_memory" && (
            <AgentMemoryTab
              data={agentMemory}
              loading={loading.agent_memory}
              fetchedAt={fetchedAt.agent_memory}
              onRefresh={() => refreshTab("agent_memory")}
            />
          )}
          {tab === "prompts" && (
            <PromptsTab
              prompts={prompts.filter(p => p.category !== "cv_score")}
              loading={loading.prompts}
              fetchedAt={fetchedAt.prompts}
              onRefresh={() => refreshTab("prompts")}
              headerLabel="Edit CV builder prompts below"
            />
          )}
          {tab === "cv_score_prompts" && (
            <PromptsTab
              prompts={prompts.filter(p => p.category === "cv_score")}
              loading={loading.prompts}
              fetchedAt={fetchedAt.prompts}
              onRefresh={() => refreshTab("prompts")}
              headerLabel="Edit CV score prompts below"
            />
          )}
          {tab === "tools_prompts" && (
            <PromptsTab
              prompts={prompts.filter(p => p.category === "tools")}
              loading={loading.prompts}
              fetchedAt={fetchedAt.prompts}
              onRefresh={() => refreshTab("prompts")}
              headerLabel="Edit Cover Letter & Interview Prep prompts below (incl. the candidate & job profilers)"
            />
          )}
          {tab === "professions" && (
            <ProfessionsTab
              professions={professions}
              loading={loading.professions}
              fetchedAt={fetchedAt.professions}
              onRefresh={() => refreshTab("professions")}
            />
          )}
          {tab === "manage_templates" && <ManageTemplatesTab />}
          {tab === "tier_config" && <TierConfigTab />}
          {tab === "system" && <SystemTab />}
        </div>
      </div>
    </main>
  );
}
