"use client";
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  FiUploadCloud, FiFile, FiCheckCircle, FiXCircle, FiLock,
  FiChevronDown, FiChevronUp, FiArrowRight,
} from "react-icons/fi";
import { checkResume, type ResumeCheckResult, type CheckCategory } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { hasFeature } from "@/lib/config";

// ── helpers ─────────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 80) return { text: "text-green-600",  bg: "bg-green-50",  border: "border-green-200",  ring: "stroke-green-500" };
  if (score >= 60) return { text: "text-amber-600",  bg: "bg-amber-50",  border: "border-amber-200",  ring: "stroke-amber-500" };
  if (score >= 40) return { text: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200", ring: "stroke-orange-500" };
  return              { text: "text-red-600",    bg: "bg-red-50",    border: "border-red-200",    ring: "stroke-red-500" };
}

function statusLabel(status: CheckCategory["status"]) {
  return { excellent: "Excellent", good: "Good", needs_work: "Needs work", missing: "Missing" }[status];
}

function ScoreCircle({ score }: { score: number }) {
  const c = scoreColor(score);
  const r = 44;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="relative flex items-center justify-center">
      <svg width="120" height="120" className="-rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" className={c.ring} strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <div className="absolute text-center">
        <div className={`text-3xl font-bold ${c.text}`}>{score}</div>
        <div className="text-xs text-slate-400 font-medium">/100</div>
      </div>
    </div>
  );
}

// ── category card ────────────────────────────────────────────────────────────

function CategoryCard({
  cat,
  canSeeImprovements,
}: {
  cat: CheckCategory;
  canSeeImprovements: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const c = scoreColor(cat.score);
  const passed = cat.checks.filter((ch) => ch.passed).length;
  const total  = cat.checks.length;

  return (
    <div className={`rounded-2xl border ${c.border} bg-white overflow-hidden`}>
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 transition text-left"
      >
        <div className={`flex-shrink-0 w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center`}>
          <span className={`text-lg font-bold ${c.text}`}>{cat.score}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-slate-800 text-sm">{cat.name}</p>
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${c.bg} ${c.text}`}>
              {statusLabel(cat.status)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${cat.score >= 80 ? "bg-green-500" : cat.score >= 60 ? "bg-amber-500" : cat.score >= 40 ? "bg-orange-500" : "bg-red-500"}`}
                style={{ width: `${cat.score}%` }} />
            </div>
            <span className="text-xs text-slate-400 shrink-0">{passed}/{total} checks</span>
          </div>
        </div>
        {expanded ? <FiChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <FiChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-4">
          {/* Check items */}
          <ul className="space-y-2">
            {cat.checks.map((ch, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                {ch.passed
                  ? <FiCheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                  : <FiXCircle    className="w-4 h-4 text-red-400   shrink-0" />}
                <span className={ch.passed ? "text-slate-700" : "text-slate-500"}>{ch.label}</span>
              </li>
            ))}
          </ul>

          {/* Improvements */}
          {cat.improvements.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Improvements
              </p>
              {canSeeImprovements ? (
                <ul className="space-y-1.5">
                  {cat.improvements.map((imp, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="text-brand-500 mt-0.5 shrink-0">→</span>
                      {imp}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="relative">
                  <ul className="space-y-1.5 select-none pointer-events-none">
                    {cat.improvements.slice(0, 1).map((imp, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-600 blur-sm">
                        <span className="text-brand-500 mt-0.5 shrink-0">→</span>
                        {imp}
                      </li>
                    ))}
                  </ul>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Link
                      href="/auth/register"
                      className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-brand-600 shadow-sm hover:border-brand-300 transition"
                    >
                      <FiLock className="w-3 h-3" /> Upgrade to Plus to unlock
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── main page ────────────────────────────────────────────────────────────────

export default function ResumeCheckerPage() {
  const { data: session } = useAuth();
  const tier = session?.user?.tier ?? "free";
  const canSeeImprovements = hasFeature(tier, "pdf_export"); // Plus+ can see improvements

  const [file, setFile]       = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<ResumeCheckResult | null>(null);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) { setFile(accepted[0]); setResult(null); }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"] },
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024,
    onDropRejected: () => toast.error("Please upload a PDF or DOCX under 5 MB."),
  });

  async function handleCheck() {
    if (!file) return;
    setLoading(true);
    try {
      const res = await checkResume(file);
      setResult(res);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? "Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const c = result ? scoreColor(result.overall_score) : null;

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-6 py-10">

      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Resume Checker</h1>
        <p className="text-slate-500 mt-2 max-w-lg mx-auto text-sm">
          Upload your resume for an instant AI-powered quality analysis. Free for everyone — no sign-in required.
        </p>
      </div>

      {/* Upload card */}
      <div className="card mb-6">
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
            isDragActive ? "border-brand-400 bg-brand-50" : "border-slate-200 hover:border-brand-300 hover:bg-slate-50"
          }`}
        >
          <input {...getInputProps()} />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FiFile className="w-6 h-6 text-brand-500 shrink-0" />
              <span className="font-medium text-slate-700 truncate">{file.name}</span>
            </div>
          ) : (
            <>
              <FiUploadCloud className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="font-medium text-slate-600">
                {isDragActive ? "Drop your resume here" : "Drag & drop your resume"}
              </p>
              <p className="text-xs text-slate-400 mt-1">or click to browse · PDF or DOCX · max 5 MB</p>
            </>
          )}
        </div>

        <button
          onClick={handleCheck}
          disabled={!file || loading}
          className="mt-4 w-full btn-primary py-3 text-base flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? (
            <><span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Analysing…</>
          ) : (
            <>Analyse Resume</>
          )}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-6">

          {/* Overall score */}
          <div className={`card flex flex-col sm:flex-row items-center gap-6 ${c!.bg} border ${c!.border}`}>
            <ScoreCircle score={result.overall_score} />
            <div className="text-center sm:text-left">
              <h2 className="text-xl font-bold text-slate-900">
                {result.overall_score >= 80 ? "Strong resume" :
                 result.overall_score >= 60 ? "Good resume, room to improve" :
                 result.overall_score >= 40 ? "Needs some work" : "Significant improvements needed"}
              </h2>
              <p className="text-slate-600 text-sm mt-1 max-w-md">{result.summary}</p>
              {!canSeeImprovements && (
                <Link
                  href="/auth/register"
                  className="inline-flex items-center gap-1.5 mt-3 text-sm font-semibold text-brand-600 hover:text-brand-700"
                >
                  Upgrade to Plus for detailed fixes <FiArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          </div>

          {/* Category breakdown */}
          <div>
            <h3 className="font-semibold text-slate-700 mb-3 text-sm uppercase tracking-wide">Category Breakdown</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {result.categories.map((cat) => (
                <CategoryCard key={cat.key} cat={cat} canSeeImprovements={canSeeImprovements} />
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="card text-center py-6">
            <p className="font-semibold text-slate-800 mb-1">Ready to tailor this resume for a specific job?</p>
            <p className="text-sm text-slate-500 mb-4">Use the AI builder to optimise your resume for any job description in minutes.</p>
            <Link href="/builder/upload" className="btn-primary px-6 py-2.5 inline-flex items-center gap-2">
              Tailor with AI <FiArrowRight className="w-4 h-4" />
            </Link>
          </div>

        </div>
      )}
    </div>
  );
}
