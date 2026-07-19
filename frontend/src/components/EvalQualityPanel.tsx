"use client";
/**
 * Resume quality score panel — shared between builder/preview and builder/template.
 * Displays the multi-evaluator score, quality label, progress bar, and cycle count.
 */
import Link from "next/link";
import { FiAward, FiAlertTriangle, FiTrendingUp, FiZap, FiLock, FiRefreshCw, FiCheck, FiUser } from "react-icons/fi";
import type { EvalSummary } from "@/lib/api";

// Priority chip colours — critical (red) → high (amber) → medium (slate).
const PRIORITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high:     "bg-amber-100 text-amber-700",
  medium:   "bg-slate-100 text-slate-600",
};

/**
 * "What only you can add" — the score-blocking fixes the AI cannot make itself
 * because they require real data it must never fabricate (a team size, a
 * metric, a missing contact field). Surfaced so the user can add them and
 * regenerate for a higher score. Anti-hallucination checked server-side, so
 * anything already in the CV is never shown here.
 */
interface AutofixProps {
  /** Pro tier: shows the auto-fix button; other tiers see the upgrade row. */
  canAutofix?: boolean;
  onAutofix?: () => void;
  autofixLoading?: boolean;
}

function UserActionsCard({ summary, canAutofix, onAutofix, autofixLoading }: { summary: EvalSummary } & AutofixProps) {
  const ua = summary.user_actions_needed;
  if (!ua || !ua.actions || ua.actions.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-white/80 p-3.5">
      <div className="flex items-center gap-2 mb-1.5">
        <FiTrendingUp className="w-4 h-4 text-amber-600 shrink-0" />
        <span className="font-semibold text-sm text-slate-800">Add these to raise your score</span>
        {ua.estimated_points_available > 0 && (
          <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">
            +{ua.estimated_points_available} pts possible
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 leading-relaxed mb-2.5">
        {ua.current_score}/100 — {ua.points_needed} below your {ua.target_score} target. These are real
        details only you can add; the AI never invents facts.
      </p>
      <ul className="flex flex-col gap-2">
        {ua.actions.map((a, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${PRIORITY_STYLES[a.priority] ?? PRIORITY_STYLES.medium}`}>
              {a.priority}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-800">
                {a.action}
                {a.score_impact > 0 && <span className="text-slate-400 font-normal"> · +{a.score_impact}</span>}
                {a.needs_user && (
                  <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-brand-700 bg-brand-50 border border-brand-200 rounded px-1.5 py-0.5 align-middle">
                    <FiUser className="w-2.5 h-2.5" /> needs your input
                  </span>
                )}
              </p>
              {a.example && <p className="text-[11px] text-slate-400 mt-0.5 truncate">e.g. {a.example}</p>}
              {a.needs_user && a.why_ai_cannot && (
                <p className="text-[11px] text-slate-400 mt-0.5">AI can&apos;t fill this: {a.why_ai_cannot}</p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Persistent record of what the last auto-fix changed — the toast is
          transient, and an unchanged-looking card read as "nothing happened"
          even when edits were persisted (user report 2026-07-19). */}
      {summary.autofix && summary.autofix.applied.length > 0 && (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50/70 p-2.5">
          <p className="text-xs font-semibold text-green-800 flex items-center gap-1.5">
            <FiCheck className="w-3.5 h-3.5" />
            Auto-fixed from your data ({summary.autofix.applied.length})
            {summary.autofix.score_after > summary.autofix.score_before &&
              ` — score ${summary.autofix.score_before} → ${summary.autofix.score_after}`}
          </p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {summary.autofix.applied.slice(0, 6).map((c, i) => (
              <li key={i} className="text-[11px] text-green-900/80 truncate">• {c.gap || c.path}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[11px] text-slate-400 mt-2.5">
        Update these in your CV or profile, then regenerate for a higher score.
      </p>

      {/* AI Auto-Fix — Pro: one click fills what the user's OWN data already
          supports (original CV + profile); nothing is ever invented. Items
          with no source stay on this list. */}
      {onAutofix && (canAutofix ? (
        <div className="mt-3 pt-3 border-t border-amber-100 flex flex-col sm:flex-row sm:items-center gap-2">
          <button
            onClick={onAutofix}
            disabled={autofixLoading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition disabled:opacity-60 shrink-0"
          >
            {autofixLoading
              ? <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
              : <FiZap className="w-3.5 h-3.5" />}
            {autofixLoading ? "Fixing from your data…" : "Auto-fix from my profile & CV"}
          </button>
          <p className="text-[11px] text-slate-400 leading-snug">
            Fills what your saved profile and original CV already prove — never invents facts.
            Anything not in your data stays on this list.
          </p>
        </div>
      ) : (
        <Link
          href="/settings/plan"
          className="mt-3 pt-3 border-t border-amber-100 flex items-center gap-2 group"
        >
          <FiLock className="w-3.5 h-3.5 text-slate-400 group-hover:text-brand-500 shrink-0" />
          <span className="text-[11px] text-slate-500 group-hover:text-brand-600">
            <span className="font-semibold">Auto-fix with AI</span>
            <span className="ml-1 text-[10px] font-semibold bg-brand-100 text-brand-700 rounded px-1 py-0.5">PRO</span>
            <span className="ml-1.5">— let the AI fill these from your own profile &amp; CV. Upgrade to unlock.</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

function qualityLabel(score: number, threshold: number): string {
  if (score >= threshold + 30) return "Excellent";
  if (score >= threshold + 15) return "Strong";
  if (score >= threshold) return "Good";
  return "Reviewed";
}

// Per-category bar colour — absolute bands, matching the CV Score page.
function catBar(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 65) return "bg-amber-500";
  return "bg-red-500";
}

/**
 * Per-category breakdown + "what blocked your target" + faithfulness warning.
 * Renders the SAME 8 categories the CV Score page shows, so the builder result
 * explains exactly why the headline score is what it is. No-op when the backend
 * sent no category data (older sessions / cached results).
 */
function ScoreBreakdown({ summary }: { summary: EvalSummary }) {
  const cats = summary.category_scores ?? [];
  if (cats.length === 0) return null;
  const blocking = summary.blocking_categories ?? [];
  const target = summary.pass_threshold;
  const tierLabel = summary.tier ? summary.tier[0].toUpperCase() + summary.tier.slice(1) : "your";

  return (
    <div className="mt-3 pt-3 border-t border-white/60 flex flex-col gap-2.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
        {cats.map(c => (
          <div key={c.key} className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 text-slate-600 truncate">{c.name}</span>
            <div className="flex-1 h-1.5 bg-white/70 rounded-full overflow-hidden border border-white">
              <div className={`h-full rounded-full ${catBar(c.score)}`}
                style={{ width: `${Math.min(100, Math.max(0, c.score))}%` }} />
            </div>
            <span className="w-7 text-right font-semibold text-slate-700 shrink-0">{c.score}</span>
          </div>
        ))}
      </div>

      {!summary.all_passed && blocking.length > 0 && (
        <p className="text-xs text-slate-600 leading-relaxed">
          <span className="font-semibold text-slate-700">Below your {tierLabel} target of {target}: </span>
          {blocking.slice(0, 3).map(c => `${c.name} (${c.score})`).join(", ")}
          {blocking.length > 3 ? ` +${blocking.length - 3} more` : ""}. Improving these raises your score.
        </p>
      )}

      {summary.faithfulness_warning && (
        <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
          <FiAlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span><span className="font-semibold">Check this claim: </span>{summary.faithfulness_warning}</span>
        </div>
      )}

      <PageFit summary={summary} />
    </div>
  );
}

/** One-line page-fit status against the template's A4 page budget. */
function PageFit({ summary }: { summary: EvalSummary }) {
  const lv = summary.layout_validation;
  const budget = summary.template_pages;
  if (!lv || !budget) return null;
  const overflow = lv.truncated || lv.page_fit === "overflow_risk";
  return (
    <p className={`text-xs ${overflow ? "text-amber-700" : "text-slate-500"}`}>
      {overflow ? <FiAlertTriangle className="inline w-3 h-3 mr-1 -mt-0.5" /> : null}
      {overflow
        ? `Content runs to ~${lv.estimated_pages} pages on this ${budget}-page template — consider a 2-page template or trimming.`
        : `Fits the ${budget}-page template.`}
    </p>
  );
}

function qualityColors(score: number, threshold: number) {
  const delta = score - threshold;
  if (delta >= 30) return { bg: "bg-green-50",  border: "border-green-200", badge: "bg-green-100 text-green-700",  bar: "bg-green-500"  };
  if (delta >= 15) return { bg: "bg-teal-50",   border: "border-teal-200",  badge: "bg-teal-100  text-teal-700",   bar: "bg-teal-500"   };
  if (delta >= 0)  return { bg: "bg-blue-50",   border: "border-blue-200",  badge: "bg-blue-100  text-blue-700",   bar: "bg-blue-500"   };
  return               { bg: "bg-slate-50",  border: "border-slate-200", badge: "bg-slate-100 text-slate-600", bar: "bg-slate-400"  };
}

// ── Compact variant — used on builder/template ────────────────────────────────

export function EvalQualityPanel({ evalSummary }: { evalSummary: EvalSummary }) {
  const { min_score, pass_threshold } = evalSummary;
  const label  = qualityLabel(min_score, pass_threshold);
  const colors = qualityColors(min_score, pass_threshold);

  return (
    <div className={`rounded-2xl border ${colors.border} ${colors.bg} p-4`}>
      <div className="flex items-center gap-3 mb-3">
        <FiAward className="w-5 h-5 text-slate-500 shrink-0" />
        <p className="font-semibold text-slate-700 text-sm">Resume Quality</p>
        <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>{label}</span>
      </div>
      <div className="flex items-center gap-3 mb-2">
        <div className="flex-1 h-2 bg-white/70 rounded-full overflow-hidden border border-white">
          <div className={`h-full rounded-full ${colors.bar}`}
            style={{ width: `${Math.min(100, Math.max(0, min_score))}%` }} />
        </div>
        <span className="text-sm font-bold text-slate-700 shrink-0">
          {min_score}<span className="text-xs font-normal text-slate-400">/100</span>
        </span>
      </div>
      <ScoreBreakdown summary={evalSummary} />
    </div>
  );
}

// ── Expanded variant — used on builder/preview ────────────────────────────────

export function EvalSummaryPanel({ summary, canAutofix, onAutofix, autofixLoading }: { summary: EvalSummary } & AutofixProps) {
  const { min_score, pass_threshold, profession } = summary;
  const label  = qualityLabel(min_score, pass_threshold);
  const colors = qualityColors(min_score, pass_threshold);

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${colors.border} ${colors.bg}`}>
      {/* Final score only — per-evaluator chips and iteration copy removed by design */}
      <div className="flex items-center gap-3">
        <FiAward className="w-5 h-5 text-slate-500 shrink-0" />
        <span className="font-semibold text-sm text-slate-800">CV Score</span>
        <span className="text-2xl font-bold text-slate-900">
          {min_score}<span className="text-sm font-normal text-slate-400">/100</span>
        </span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>{label}</span>
        {profession && (
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600 capitalize shrink-0">
            {profession}
          </span>
        )}
      </div>
      <ScoreBreakdown summary={summary} />
      <UserActionsCard summary={summary} canAutofix={canAutofix} onAutofix={onAutofix} autofixLoading={autofixLoading} />
    </div>
  );
}
