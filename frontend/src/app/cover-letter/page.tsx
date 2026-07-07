"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { generateCoverLetterStandalone, type CoverLetterResult } from "@/lib/api";
import { FiMail, FiCopy, FiCheck, FiRefreshCw, FiZap } from "react-icons/fi";
import ResumeLibrary from "@/components/ResumeLibrary";

// ── Result card ────────────────────────────────────────────────────────────────

function CoverLetterCard({
  result,
  onRegenerate,
  regenerating,
}: {
  result: CoverLetterResult;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const text = result.subject_line
      ? `Subject: ${result.subject_line}\n\n${result.full_text}`
      : result.full_text;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
            <FiMail className="w-4 h-4 text-white" />
          </div>
          <h2 className="text-base font-semibold text-slate-800">Cover Letter</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiRefreshCw className={`w-3.5 h-3.5 ${regenerating ? "animate-spin" : ""}`} />
            {regenerating ? "Regenerating…" : "Regenerate"}
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100 hover:border-brand-300 transition"
          >
            {copied ? <FiCheck className="w-3.5 h-3.5" /> : <FiCopy className="w-3.5 h-3.5" />}
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {result.subject_line && (
        <div>
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Subject line</p>
          <p className="text-sm font-semibold text-slate-800">{result.subject_line}</p>
        </div>
      )}

      <div>
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Letter</p>
        <textarea
          readOnly
          className="input resize-none text-sm font-mono h-96 text-slate-700 bg-slate-50 cursor-default"
          value={result.full_text}
        />
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function CoverLetterPage() {
  const [resumeText, setResumeText]   = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState<CoverLetterResult | null>(null);
  const [roleInput, setRoleInput]     = useState("");

  const canGenerate = resumeText.trim().length >= 100 && jobDescription.trim().length >= 100;

  async function handleGenerate(roleOverride = "") {
    if (!canGenerate) return;
    setLoading(true);
    try {
      const cl = await generateCoverLetterStandalone(resumeText, jobDescription, roleOverride);
      setResult(cl);
      setRoleInput(cl.detected_role ?? "");
    } catch {
      toast.error("Failed to generate cover letter — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-6 py-8 px-4 sm:px-0">

      {/* Deep-teal identity — portal palette; Interview Prep uses the emerald variant */}
      <div className="rounded-2xl bg-gradient-to-r from-brand-800 to-brand-600 px-6 py-5 text-white">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <FiMail className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Cover Letter Generator</h1>
        </div>
        <p className="text-brand-100 text-sm">
          Paste your resume and the job description — AI writes a tailored cover letter in seconds.
        </p>
      </div>

      {/* Pull a saved resume straight into the form */}
      <ResumeLibrary
        variant="picker"
        requireText
        title="Your Resume Library"
        subtitle="Copy a saved resume into the form below — no re-pasting."
        ctaLabel="Copy into form"
        onUseResume={(r) => { setResumeText(r.resume_text ?? ""); setResult(null); toast.success(`"${r.name}" copied into the form.`); }}
      />

      <div className="card space-y-5">
        {/* Resume + JD side by side on wide screens — uses the full page width */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div>
            <label className="label">Your Resume</label>
            <textarea
              className="input h-64 resize-none font-mono text-xs"
              placeholder="Paste your resume text here…"
              value={resumeText}
              onChange={(e) => { setResumeText(e.target.value); setResult(null); }}
            />
            <p className="text-xs text-slate-400 mt-1">{resumeText.length} characters</p>
          </div>

          <div>
            <label className="label">Job Description</label>
            <textarea
              className="input h-64 resize-none font-mono text-xs"
              placeholder="Paste the job description here…"
              value={jobDescription}
              onChange={(e) => { setJobDescription(e.target.value); setResult(null); }}
            />
            <p className="text-xs text-slate-400 mt-1">{jobDescription.length} characters</p>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button
            onClick={() => handleGenerate()}
            disabled={!canGenerate || loading}
            className="btn-primary flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading
              ? <><span className="w-4 h-4 rounded-full border-2 border-white/50 border-t-white animate-spin shrink-0" /> Generating…</>
              : <><FiZap className="w-4 h-4" /> Generate Cover Letter</>
            }
          </button>
        </div>
      </div>

      {result && (
        <div className="space-y-4">
          {/* Detected role — editable; lets the user re-target if the role was misread */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-2">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Letter targets this role
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                className="input flex-1"
                value={roleInput}
                onChange={(e) => setRoleInput(e.target.value)}
                placeholder="e.g. Senior Backend Engineer"
                onKeyDown={(e) => { if (e.key === "Enter" && roleInput.trim()) handleGenerate(roleInput.trim()); }}
              />
              <button
                onClick={() => handleGenerate(roleInput.trim())}
                disabled={loading || !roleInput.trim()}
                className="btn-secondary flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                Regenerate for this role
              </button>
            </div>
            <p className="text-xs text-slate-400">Not the right role? Edit it and regenerate to re-target the letter.</p>
          </div>

          <CoverLetterCard
            result={result}
            onRegenerate={() => handleGenerate(roleInput.trim())}
            regenerating={loading}
          />
        </div>
      )}

    </div>
  );
}
