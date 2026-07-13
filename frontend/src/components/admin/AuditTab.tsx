"use client";
import { useEffect, useState } from "react";
import { adminListAudit, type AuditPage } from "@/lib/api";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import {
  ACTION_LABELS, ColFilterText, ColFilterSelect, AccountTypeBadge,
  formatDateTime, TabHeader, Spinner,
} from "./shared";

// ── Audit tab ──────────────────────────────────────────────────────────────────

function AuditTab({
  initialData, loading, fetchedAt, onRefresh,
}: {
  initialData: AuditPage | null;
  loading: boolean;
  fetchedAt: Date | null;
  onRefresh: () => void;
}) {
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  const [pageData, setPageData] = useState<AuditPage | null>(initialData);
  const [pageLoading, setPageLoading] = useState(false);

  // Sync when parent refreshes page 1
  useEffect(() => {
    setPage(1);
    setPageData(initialData);
  }, [initialData]);

  async function goToPage(p: number) {
    setPageLoading(true);
    try {
      setPageData(await adminListAudit(p, PAGE_SIZE));
      setPage(p);
    } finally {
      setPageLoading(false);
    }
  }

  const data = pageData;
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;
  const busy = loading || pageLoading;

  // Per-column filters (applied to the current page — the log is server-paginated).
  const [userF, setUserF] = useState("");
  const [actionF, setActionF] = useState("");
  const items = data?.items ?? [];
  const actionOptions = [
    { value: "", label: "All actions" },
    ...Array.from(new Set(items.map(i => i.action))).map(a => ({ value: a, label: ACTION_LABELS[a] ?? a })),
  ];
  const shown = items.filter(e =>
    (!userF || e.user_email.toLowerCase().includes(userF.trim().toLowerCase())) &&
    (!actionF || e.action === actionF)
  );
  const num = (v: unknown) =>
    typeof v === "number" ? v.toLocaleString()
      : (v != null && !isNaN(Number(v)) ? Number(v).toLocaleString() : "—");
  const cost = (v: unknown) => typeof v === "number" ? `$${v.toFixed(4)}` : "—";

  return (
    <div>
      <TabHeader
        count={data?.total}
        label="total entries"
        fetchedAt={fetchedAt}
        loading={loading}
        onRefresh={onRefresh}
      />

      {busy && !data ? <Spinner text="Loading audit log…" /> : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {[
                    { label: "Time",      cls: "" },
                    { label: "User",      cls: "hidden sm:table-cell" },
                    { label: "Action",    cls: "" },
                    { label: "Cycles",    cls: "text-right whitespace-nowrap" },
                    { label: "LLM Calls", cls: "text-right" },
                    { label: "Tokens",    cls: "text-right hidden sm:table-cell" },
                    { label: "Est. Cost", cls: "text-right" },
                    { label: "Details",   cls: "hidden lg:table-cell" },
                  ].map(({ label, cls }) => (
                    <th key={label} className={`px-4 pt-3 pb-1.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap ${cls}`}>{label}</th>
                  ))}
                </tr>
                {/* Per-column filter row */}
                <tr className="border-t border-slate-100">
                  <th className="px-3 pb-2 align-top" />
                  <th className="px-3 pb-2 align-top hidden sm:table-cell">
                    <ColFilterText value={userF} onChange={setUserF} placeholder="Filter user…" />
                  </th>
                  <th className="px-3 pb-2 align-top">
                    <ColFilterSelect value={actionF} onChange={setActionF} options={actionOptions} />
                  </th>
                  <th className="px-3 pb-2 align-top" />
                  <th className="px-3 pb-2 align-top" />
                  <th className="px-3 pb-2 align-top hidden sm:table-cell" />
                  <th className="px-3 pb-2 align-top" />
                  <th className="px-3 pb-2 align-top hidden lg:table-cell" />
                </tr>
              </thead>
              <tbody className={`divide-y divide-slate-100 ${busy ? "opacity-50" : ""}`}>
                {shown.map(e => {
                  const md = e.metadata as Record<string, unknown>;
                  return (
                    <tr key={e.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">{formatDateTime(e.created_at)}</td>
                      <td className="px-4 py-3 whitespace-nowrap hidden sm:table-cell">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-700">{e.user_email || "—"}</span>
                          <AccountTypeBadge tier={e.user_tier} />
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-medium bg-slate-100 text-slate-700 rounded px-2 py-0.5">
                          {ACTION_LABELS[e.action] ?? e.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {typeof md.cycles === "number" ? `${md.cycles} / ${num(md.max_cycles)}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-600 tabular-nums">{num(md.llm_calls)}</td>
                      <td className="px-4 py-3 text-right text-xs text-slate-600 tabular-nums hidden sm:table-cell">{num(md.tokens)}</td>
                      <td className="px-4 py-3 text-right text-xs text-slate-600 tabular-nums">{cost(md.est_cost_usd)}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs max-w-xs truncate hidden lg:table-cell">
                        {Object.entries(e.metadata)
                          .filter(([k]) => !["cycles", "max_cycles", "llm_calls", "tokens", "est_cost_usd", "cache_read_tokens"].includes(k))
                          .map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"}
                      </td>
                    </tr>
                  );
                })}
                {!shown.length && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    {items.length ? "No entries match the current filters." : "No audit entries yet."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page === 1 || busy}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-slate-50"
              >
                <FiChevronLeft className="w-4 h-4" /> Prev
              </button>
              <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
              <button
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages || busy}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-slate-50"
              >
                Next <FiChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default AuditTab;
