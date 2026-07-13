"use client";
import { useEffect, useState } from "react";
import {
  adminUpdateUser, adminDeleteUser,
  type AdminUser, type UserStats,
} from "@/lib/api";
import {
  FiChevronDown, FiChevronUp, FiToggleLeft, FiToggleRight,
  FiSave, FiRotateCcw, FiTrash2,
} from "react-icons/fi";
import {
  TIER_COLORS, ColFilterText, ColFilterSelect, formatDate, TabHeader, Spinner,
} from "./shared";

// ── Users tab ──────────────────────────────────────────────────────────────────

function UserRow({
  user,
  statsCache,
  fetchStats,
  onRefresh,
}: {
  user: AdminUser;
  statsCache: Map<string, UserStats>;
  fetchStats: (id: string) => Promise<void>;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [actioning, setActioning] = useState(false);
  const [msg, setMsg] = useState("");
  const stats = statsCache.get(user.id);

  // Draft state — edits stay local until Save is clicked
  const [draftTier, setDraftTier] = useState(user.tier);
  const [draftActive, setDraftActive] = useState(user.is_active);
  const [draftAdmin, setDraftAdmin] = useState(user.is_superadmin);

  // Keep draft in sync if the underlying user changes (e.g. after refresh)
  useEffect(() => {
    setDraftTier(user.tier);
    setDraftActive(user.is_active);
    setDraftAdmin(user.is_superadmin);
  }, [user.tier, user.is_active, user.is_superadmin]);

  const dirty =
    draftTier !== user.tier ||
    draftActive !== user.is_active ||
    draftAdmin !== user.is_superadmin;

  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(""), 3000); }

  async function handleExpand() {
    const next = !open;
    setOpen(next);
    if (next && !stats) {
      setLoadingStats(true);
      await fetchStats(user.id);
      setLoadingStats(false);
    }
  }

  async function handleSave(e: React.MouseEvent) {
    e.stopPropagation();
    // Confirm superadmin grant/revoke since it is a privilege change
    if (draftAdmin !== user.is_superadmin) {
      const ok = draftAdmin
        ? confirm(`Grant superadmin to ${user.email}? They will have full admin access.`)
        : confirm(`Remove superadmin from ${user.email}?`);
      if (!ok) return;
    }
    const payload: { tier?: string; is_active?: boolean; is_superadmin?: boolean } = {};
    if (draftTier !== user.tier) payload.tier = draftTier;
    if (draftActive !== user.is_active) payload.is_active = draftActive;
    if (draftAdmin !== user.is_superadmin) payload.is_superadmin = draftAdmin;

    setActioning(true);
    try {
      await adminUpdateUser(user.id, payload);
      flash("Saved");
      onRefresh();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      flash(detail || "Save failed");
    }
    finally { setActioning(false); }
  }

  function handleReset(e: React.MouseEvent) {
    e.stopPropagation();
    setDraftTier(user.tier);
    setDraftActive(user.is_active);
    setDraftAdmin(user.is_superadmin);
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (user.is_superadmin) { flash("Revoke superadmin first"); return; }
    if (!confirm(`Permanently delete ${user.email} and all their data? This cannot be undone.`)) return;
    setActioning(true);
    try {
      await adminDeleteUser(user.id);
      onRefresh();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      flash(detail || "Delete failed");
    }
    finally { setActioning(false); }
  }

  return (
    <>
      <tr className={`hover:bg-slate-50 transition cursor-pointer ${dirty ? "bg-amber-50/40" : ""}`} onClick={handleExpand}>
        <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
          <span className="flex items-center gap-1.5">
            {open ? <FiChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <FiChevronDown className="w-3.5 h-3.5 text-slate-400" />}
            {user.name}
          </span>
        </td>
        <td className="px-4 py-3 text-slate-600 whitespace-nowrap hidden sm:table-cell">{user.email}</td>
        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
          <select
            value={draftTier}
            disabled={actioning}
            onChange={e => setDraftTier(e.target.value)}
            className={`text-xs font-semibold rounded-lg px-2 py-1 border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-40 capitalize ${TIER_COLORS[draftTier] ?? "bg-slate-100 text-slate-600"}`}
          >
            <option value="free">free</option>
            <option value="plus">plus</option>
            <option value="pro">pro</option>
          </select>
        </td>
        <td className="px-4 py-3 text-slate-500 whitespace-nowrap hidden md:table-cell">{formatDate(user.created_at)}</td>
        <td className="px-4 py-3 hidden sm:table-cell">
          <span className={`text-xs font-semibold rounded px-2 py-0.5 ${draftActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
            {draftActive ? "Active" : "Disabled"}
          </span>
        </td>
        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-3">
            {msg && (
              <span className={`text-xs font-medium whitespace-nowrap ${msg.includes("Revoke") || msg.includes("failed") || msg.includes("Failed") ? "text-red-600" : "text-green-600"}`}>
                {msg}
              </span>
            )}

            {/* Superadmin checkbox — edits draft only */}
            <label
              className="flex items-center gap-1.5 cursor-pointer"
              onClick={e => e.stopPropagation()}
              title="Grant or revoke superadmin (applies on Save)"
            >
              <input
                type="checkbox"
                checked={draftAdmin}
                disabled={actioning}
                onChange={e => setDraftAdmin(e.target.checked)}
                className="w-3.5 h-3.5 accent-brand-600 cursor-pointer disabled:opacity-40"
              />
              <span className="text-xs text-slate-500 select-none">Admin</span>
            </label>

            {/* Enable/Disable toggle — edits draft only; superadmins can't be disabled */}
            <button
              onClick={e => { e.stopPropagation(); if (draftAdmin) { flash("Revoke superadmin first"); return; } setDraftActive(v => !v); }}
              disabled={actioning}
              title={draftAdmin ? "Revoke superadmin first" : draftActive ? "Disable account" : "Enable account"}
              className="text-slate-400 hover:text-slate-700 disabled:opacity-40"
            >
              {draftActive
                ? <FiToggleRight className={`w-5 h-5 ${draftAdmin ? "opacity-30" : "text-teal-600"}`} />
                : <FiToggleLeft className="w-5 h-5" />}
            </button>

            <div className="w-px h-4 bg-slate-200" />

            {/* Save — always visible, disabled until something changes */}
            <button
              onClick={handleSave}
              disabled={!dirty || actioning}
              title={dirty ? "Save changes" : "No changes to save"}
              className="flex items-center gap-1 text-xs font-semibold bg-brand-600 text-white rounded-lg px-2.5 py-1 hover:bg-brand-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              <FiSave className="w-3 h-3" /> Save
            </button>

            {/* Reset — only shown when dirty */}
            {dirty && (
              <button
                onClick={handleReset}
                disabled={actioning}
                title="Discard changes"
                className="text-slate-400 hover:text-slate-600 disabled:opacity-40"
              >
                <FiRotateCcw className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Delete — always available (guarded against superadmin) */}
            <button
              onClick={handleDelete}
              disabled={actioning}
              title={user.is_superadmin ? "Revoke superadmin first" : "Delete user and all data"}
              className="text-slate-400 hover:text-red-500 disabled:opacity-40"
            >
              <FiTrash2 className={`w-4 h-4 ${user.is_superadmin ? "opacity-30" : ""}`} />
            </button>
          </div>
        </td>
      </tr>

      {open && (
        <tr className="bg-slate-50 border-b border-slate-100">
          <td colSpan={6} className="px-6 py-3">
            <div className="flex items-start gap-8 flex-wrap">
              {/* Activity stats */}
              {loadingStats ? (
                <span className="text-xs text-slate-400">Loading activity…</span>
              ) : stats ? (
                <div className="flex gap-6 text-sm">
                  {[
                    ["Sessions",   stats.session_count],
                    ["Resumes",    stats.resume_count],
                    ["Alerts",     stats.alert_count],
                    ["Saved Jobs", stats.saved_job_count],
                  ].map(([label, val]) => (
                    <div key={String(label)}>
                      <span className="text-slate-500 text-xs">{label}</span>
                      <p className="font-semibold text-slate-800">{val}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-slate-400">No stats available.</span>
              )}

            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function UsersTab({
  users, loading, fetchedAt, onRefresh, statsCache, fetchStats,
}: {
  users: AdminUser[];
  loading: boolean;
  fetchedAt: Date | null;
  onRefresh: () => void;
  statsCache: Map<string, UserStats>;
  fetchStats: (id: string) => Promise<void>;
}) {
  const [nameFilter, setNameFilter] = useState("");
  const [emailFilter, setEmailFilter] = useState("");
  const [tierFilter, setTierFilter] = useState<"" | "free" | "plus" | "pro">("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");
  const anyFilter = !!(nameFilter || emailFilter || tierFilter || statusFilter);

  const filtered = users.filter(u => {
    const matchName = !nameFilter || u.name.toLowerCase().includes(nameFilter.trim().toLowerCase());
    const matchEmail = !emailFilter || u.email.toLowerCase().includes(emailFilter.trim().toLowerCase());
    const matchTier = !tierFilter || u.tier === tierFilter;
    const matchStatus = !statusFilter || (statusFilter === "active" ? u.is_active : !u.is_active);
    return matchName && matchEmail && matchTier && matchStatus;
  });

  const clearAll = () => { setNameFilter(""); setEmailFilter(""); setTierFilter(""); setStatusFilter(""); };

  return (
    <div className="space-y-3">
      <TabHeader count={filtered.length === users.length ? users.length : undefined} label={
        filtered.length === users.length ? "total users" : `${filtered.length} of ${users.length} users`
      } fetchedAt={fetchedAt} loading={loading} onRefresh={onRefresh} />

      {loading && !users.length ? <Spinner text="Loading users…" /> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {[
                  { label: "Name",    cls: "" },
                  { label: "Email",   cls: "hidden sm:table-cell" },
                  { label: "Tier",    cls: "" },
                  { label: "Joined",  cls: "hidden md:table-cell" },
                  { label: "Status",  cls: "hidden sm:table-cell" },
                  { label: "Actions", cls: "text-right" },
                ].map(({ label, cls }) => (
                  <th key={label} className={`px-4 pt-3 pb-1.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap ${cls}`}>{label}</th>
                ))}
              </tr>
              {/* Per-column filter row */}
              <tr className="border-t border-slate-100">
                <th className="px-3 pb-2 align-top">
                  <ColFilterText value={nameFilter} onChange={setNameFilter} placeholder="Filter name…" />
                </th>
                <th className="px-3 pb-2 align-top hidden sm:table-cell">
                  <ColFilterText value={emailFilter} onChange={setEmailFilter} placeholder="Filter email…" />
                </th>
                <th className="px-3 pb-2 align-top">
                  <ColFilterSelect value={tierFilter} onChange={v => setTierFilter(v as typeof tierFilter)} options={[
                    { value: "", label: "All tiers" },
                    { value: "free", label: "Free" },
                    { value: "plus", label: "Plus" },
                    { value: "pro", label: "Pro" },
                  ]} />
                </th>
                <th className="px-3 pb-2 align-top hidden md:table-cell" />
                <th className="px-3 pb-2 align-top hidden sm:table-cell">
                  <ColFilterSelect value={statusFilter} onChange={v => setStatusFilter(v as typeof statusFilter)} options={[
                    { value: "", label: "All statuses" },
                    { value: "active", label: "Active" },
                    { value: "inactive", label: "Inactive" },
                  ]} />
                </th>
                <th className="px-3 pb-2 align-top text-right">
                  {anyFilter && (
                    <button onClick={clearAll} className="text-xs text-slate-400 hover:text-slate-700 underline underline-offset-2 whitespace-nowrap">Clear</button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(u => (
                <UserRow key={u.id} user={u} statsCache={statsCache} fetchStats={fetchStats} onRefresh={onRefresh} />
              ))}
              {!filtered.length && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  {anyFilter ? "No users match the current filters." : "No users found."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-400">Change Tier, Admin or Active on any row, then click <span className="font-semibold">Save</span> to apply. To delete a superadmin, uncheck Admin, Save, then delete.</p>
    </div>
  );
}

export default UsersTab;
