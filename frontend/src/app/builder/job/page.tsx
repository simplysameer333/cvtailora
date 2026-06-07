"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { saveJobDescription, checkFit, getSalaryBenchmark, type FitScoreResult, type SalaryBenchmarkResult } from "@/lib/api";
import { getSessionId } from "@/lib/session";
import { useStepGuard } from "@/lib/stepGuard";
import { FiBriefcase, FiTarget, FiArrowRight, FiInfo, FiZap, FiDollarSign } from "react-icons/fi";

// ── Fit score helpers ──────────────────────────────────────────────────────────

const VERDICT_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  "Strong Fit":   { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  "Good Fit":     { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200"    },
  "Moderate Fit": { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200"   },
  "Weak Fit":     { bg: "bg-red-50",     text: "text-red-700",     border: "border-red-200"     },
};

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const barColor =
    pct >= 75 ? "bg-emerald-500" :
    pct >= 55 ? "bg-blue-500"    :
    pct >= 35 ? "bg-amber-500"   :
                "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-xs text-slate-600 font-medium">{label}</span>
        <span className="text-xs font-semibold text-slate-700">{pct}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function FitPanel({ fit }: { fit: FitScoreResult }) {
  const styles = VERDICT_STYLES[fit.verdict] ?? VERDICT_STYLES["Moderate Fit"];
  const matchedToShow  = fit.matched_skills.slice(0, 6);
  const missingToShow  = fit.missing_required.slice(0, 4);

  return (
    <div className={`rounded-2xl border ${styles.border} ${styles.bg} overflow-hidden`}>
      {/* Header row */}
      <div className="flex items-center gap-4 px-5 py-4 border-b border-current/10">
        <div className="flex flex-col items-center justify-center w-16 shrink-0">
          <span className={`text-4xl font-extrabold leading-none ${styles.text}`}>{fit.overall}</span>
          <span className={`text-[10px] font-semibold uppercase tracking-wide mt-0.5 ${styles.text} opacity-70`}>/ 100</span>
        </div>
        <div className="flex-1 min-w-0">
          <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full border ${styles.border} ${styles.bg} ${styles.text}`}>
            {fit.verdict}
          </span>
          <p className="text-sm text-slate-700 mt-1.5 leading-relaxed">{fit.summary}</p>
        </div>
      </div>

      {/* Score bars */}
      <div className="px-5 py-4 space-y-3 border-b border-current/10 bg-white/60">
        <ScoreBar label="Skills Match"       value={fit.skills_match}       />
        <ScoreBar label="Experience Match"   value={fit.experience_match}   />
        <ScoreBar label="Career Alignment"   value={fit.career_alignment}   />
      </div>

      {/* Chips */}
      <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {matchedToShow.length > 0 && (
          <div>
            <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide mb-2">Matched skills</p>
            <div className="flex flex-wrap gap-1.5">
              {matchedToShow.map((s) => (
                <span key={s} className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
        {missingToShow.length > 0 && (
          <div>
            <p className="text-[11px] font-bold text-red-600 uppercase tracking-wide mb-2">Gaps to address</p>
            <div className="flex flex-wrap gap-1.5">
              {missingToShow.map((s) => (
                <span key={s} className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-600 border border-red-200">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Salary card ────────────────────────────────────────────────────────────────

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  high:   { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", label: "High confidence" },
  medium: { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200",    label: "Estimated"       },
  low:    { bg: "bg-slate-50",   text: "text-slate-600",   border: "border-slate-200",   label: "Low confidence"  },
};

function SalaryCard({ salary }: { salary: SalaryBenchmarkResult }) {
  const style = CONFIDENCE_STYLES[salary.confidence] ?? CONFIDENCE_STYLES.low;
  return (
    <div className={`rounded-2xl border ${style.border} ${style.bg} px-5 py-4 space-y-2`}>
      <div className="flex items-center gap-2">
        <FiDollarSign className={`w-4 h-4 shrink-0 ${style.text}`} />
        <span className={`text-xs font-bold uppercase tracking-wide ${style.text}`}>Salary Estimate</span>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full border ${style.border} ${style.text} font-medium`}>{style.label}</span>
      </div>
      <p className={`text-2xl font-extrabold ${style.text}`}>{salary.display_range}</p>
      {salary.location_note && (
        <p className="text-xs text-slate-600">{salary.location_note}</p>
      )}
      <p className="text-xs text-slate-500 italic">{salary.rationale}</p>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function JobPage() {
  useStepGuard("job");
  const router = useRouter();
  const [jd, setJd]                   = useState("");
  const [loading, setLoading]         = useState(false);
  const [fitLoading, setFitLoading]   = useState(false);
  const [fitResult, setFitResult]     = useState<FitScoreResult | null>(null);
  const [salaryLoading, setSalaryLoading] = useState(false);
  const [salaryResult, setSalaryResult]   = useState<SalaryBenchmarkResult | null>(null);

  useEffect(() => {
    const prefill = localStorage.getItem("tailormycv_prefill_jd");
    if (prefill) {
      setJd(prefill);
      localStorage.removeItem("tailormycv_prefill_jd");
      toast.success("Job description pre-filled from your search.");
    }
  }, []);

  async function handleCheckFit() {
    const sessionId = getSessionId();
    if (!sessionId) { toast.error("No session — please start from Step 1."); return; }
    setFitLoading(true);
    setFitResult(null);
    try {
      await saveJobDescription(sessionId, jd);
      const result = await checkFit(sessionId);
      setFitResult(result);
    } catch {
      toast.error("Could not analyse fit — please try again.");
    } finally {
      setFitLoading(false);
    }
  }

  async function handleSalaryBenchmark() {
    const sessionId = getSessionId();
    if (!sessionId) { toast.error("No session — please start from Step 1."); return; }
    setSalaryLoading(true);
    setSalaryResult(null);
    try {
      await saveJobDescription(sessionId, jd);
      const result = await getSalaryBenchmark(sessionId);
      setSalaryResult(result);
    } catch {
      toast.error("Could not estimate salary — please try again.");
    } finally {
      setSalaryLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const sessionId = getSessionId();
    if (!sessionId) { toast.error("No session — please start from Step 1."); return; }
    if (jd.trim().length < 50) { toast.error("Please paste the full job description (min 50 characters)."); return; }
    setLoading(true);
    try {
      await saveJobDescription(sessionId, jd);
      router.push("/builder/preview");
    } catch {
      toast.error("Failed to save job description.");
    } finally {
      setLoading(false);
    }
  }

  function handleSkip() {
    // No JD saved — backend will polish the resume without job-specific tailoring
    router.push("/builder/preview");
  }

  const showCheckFit = jd.trim().length >= 200;

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Add a Job Description</h1>
        <p className="text-slate-500 text-sm">
          Copy the full job posting from LinkedIn, Indeed, or any source. The more detail, the better the tailoring.
        </p>
      </div>

      {/* ── Optional / comparison banner ── */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 bg-white">
          <FiInfo className="w-4 h-4 text-brand-500 shrink-0" />
          <p className="text-sm font-semibold text-slate-700">Job description is optional</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          {/* With JD */}
          <div className="px-4 py-4 flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shrink-0 mt-0.5">
              <FiTarget className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 mb-1">With a job description</p>
              <ul className="space-y-1">
                {[
                  "AI tailors your CV to this specific role",
                  "Extracts the exact skills the employer wants",
                  "Keywords matched for ATS screening",
                  "Best for active job applications",
                ].map(t => (
                  <li key={t} className="flex items-start gap-1.5 text-xs text-slate-600">
                    <span className="text-brand-500 font-bold mt-0.5 shrink-0">✓</span>{t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {/* Without JD */}
          <div className="px-4 py-4 flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-400 flex items-center justify-center shrink-0 mt-0.5">
              <FiBriefcase className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 mb-1">Without a job description</p>
              <ul className="space-y-1">
                {[
                  "AI polishes and restructures your CV",
                  "Improves clarity, formatting and language",
                  "No role-specific tailoring",
                  "Good for updating your general CV",
                ].map(t => (
                  <li key={t} className="flex items-start gap-1.5 text-xs text-slate-500">
                    <span className="text-slate-400 font-bold mt-0.5 shrink-0">·</span>{t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ── Textarea form ── */}
      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="label">Job Description</label>
          <textarea
            className="input h-64 resize-none font-mono text-xs"
            placeholder="Paste the full job description here…"
            value={jd}
            onChange={(e) => { setJd(e.target.value); setFitResult(null); setSalaryResult(null); }}
          />
          <p className="text-xs text-slate-400 mt-1">{jd.length} characters{jd.length > 0 && jd.length < 50 ? " — paste the full description for best results" : ""}</p>
        </div>

        {/* ── Action buttons — appear once JD is long enough ── */}
        {showCheckFit && (
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              onClick={handleCheckFit}
              disabled={fitLoading}
              className="flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100 hover:border-brand-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {fitLoading
                ? <><span className="w-4 h-4 rounded-full border-2 border-brand-400 border-t-transparent animate-spin shrink-0" /> Analysing fit…</>
                : <><FiZap className="w-4 h-4 shrink-0" /> Check Fit</>
              }
            </button>
            <button
              type="button"
              onClick={handleSalaryBenchmark}
              disabled={salaryLoading}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {salaryLoading
                ? <><span className="w-4 h-4 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin shrink-0" /> Estimating…</>
                : <><FiDollarSign className="w-4 h-4 shrink-0" /> Salary Estimate</>
              }
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-1">
          <button type="button" onClick={() => router.back()} className="btn-secondary w-full sm:w-auto">
            ← Back
          </button>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleSkip}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition w-full sm:w-auto"
            >
              Skip — polish only
            </button>
            <button
              type="submit"
              disabled={loading || jd.trim().length < 50}
              className="btn-primary flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed w-full sm:w-auto"
            >
              {loading ? "Saving…" : <><FiArrowRight className="w-4 h-4" /> Tailor to this job</>}
            </button>
          </div>
        </div>
      </form>

      {/* ── Fit score panel ── */}
      {fitResult && <FitPanel fit={fitResult} />}

      {/* ── Salary estimate panel ── */}
      {salaryResult && <SalaryCard salary={salaryResult} />}

    </div>
  );
}
