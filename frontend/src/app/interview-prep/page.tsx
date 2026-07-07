"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { generateInterviewPrepStandalone, emailInterviewPrep, type InterviewPrepResult } from "@/lib/api";
import { FiBookOpen, FiChevronDown, FiChevronUp, FiZap, FiRefreshCw, FiMail, FiLoader } from "react-icons/fi";
import ResumeLibrary from "@/components/ResumeLibrary";

// ── Category colour map ────────────────────────────────────────────────────────

const CATEGORY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  "Technical":    { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200"    },
  "Behavioral":   { bg: "bg-purple-50",  text: "text-purple-700",  border: "border-purple-200"  },
  "Situational":  { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200"   },
  "Culture Fit":  { bg: "bg-teal-50",    text: "text-teal-700",    border: "border-teal-200"    },
};

function QuestionCard({ q }: { q: InterviewPrepResult["questions"][number] }) {
  const [open, setOpen] = useState(false);
  const style = CATEGORY_STYLES[q.category] ?? CATEGORY_STYLES["Technical"];

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`shrink-0 mt-0.5 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${style.bg} ${style.text} ${style.border}`}>
          {q.category}
        </span>
        <span className="flex-1 text-sm font-medium text-slate-800 leading-snug">{q.question}</span>
        {open
          ? <FiChevronUp className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          : <FiChevronDown className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        }
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500 italic">{q.why_asked}</p>
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Key points to cover</p>
            <ul className="space-y-1.5">
              {q.key_points.map((pt, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700">
                  <span className="text-brand-500 font-bold shrink-0 mt-0.5">·</span>{pt}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function InterviewPrepPage() {
  const [resumeText, setResumeText]         = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading]               = useState(false);
  const [result, setResult]                 = useState<InterviewPrepResult | null>(null);
  const [roleInput, setRoleInput]           = useState("");
  const [questionCount, setQuestionCount]   = useState(15);
  const [extraContext, setExtraContext]     = useState("");
  const [emailing, setEmailing]             = useState(false);

  const canGenerate = resumeText.trim().length >= 100 && jobDescription.trim().length >= 100;

  async function handleGenerate(roleOverride = "") {
    if (!canGenerate) return;
    setLoading(true);
    try {
      const prep = await generateInterviewPrepStandalone(
        resumeText, jobDescription, roleOverride, questionCount, extraContext,
      );
      setResult(prep);
      setRoleInput(prep.detected_role ?? "");
    } catch {
      toast.error("Failed to generate questions — please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleEmail() {
    if (!result) return;
    setEmailing(true);
    try {
      await emailInterviewPrep(result);
      toast.success("Interview prep pack sent to your email!");
    } catch {
      toast.error("Could not send the email — please try again.");
    } finally {
      setEmailing(false);
    }
  }

  return (
    <div className="w-full space-y-6 py-8 px-4 sm:px-0">

      {/* Emerald identity — portal palette; Cover Letter uses the deep-teal variant */}
      <div className="rounded-2xl bg-gradient-to-r from-teal-700 to-teal-500 px-6 py-5 text-white">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <FiBookOpen className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Interview Prep</h1>
        </div>
        <p className="text-teal-100 text-sm">
          Know what they&apos;ll ask before you walk in — AI predicts your most likely questions, with the points to hit.
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
              : <><FiZap className="w-4 h-4" /> Generate Questions</>
            }
          </button>
        </div>
      </div>

      {/* Options — question count + additional context */}
      <div className="card grid grid-cols-1 lg:grid-cols-[220px,1fr] gap-5">
        <div>
          <label className="label">Number of questions</label>
          <select
            className="input"
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
          >
            <option value={5}>5 — quick prep</option>
            <option value={10}>10 — solid prep</option>
            <option value={15}>15 — full prep</option>
          </select>
        </div>
        <div>
          <label className="label">Additional information (optional)</label>
          <input
            className="input"
            value={extraContext}
            onChange={(e) => setExtraContext(e.target.value)}
            placeholder="e.g. panel interview, focus on system design, second-round with the CTO…"
          />
          <p className="text-xs text-slate-400 mt-1">Anything you know about the interview — the questions will factor it in.</p>
        </div>
      </div>

      {result && (
        <div className="space-y-3">
          {/* Detected role — editable; lets the user re-target if the role was misread */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-2">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Questions target this role
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
            <p className="text-xs text-slate-400">Not the right role? Edit it and regenerate to re-target the questions.</p>
          </div>

          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-800">
              {result.questions.length} questions
            </h2>
            <button
              onClick={handleEmail}
              disabled={emailing}
              className="btn-accent text-sm gap-1.5 disabled:opacity-50"
              title="Send this prep pack to your account email"
            >
              {emailing
                ? <><FiLoader className="w-4 h-4 animate-spin" /> Sending…</>
                : <><FiMail className="w-4 h-4" /> Email me this pack</>}
            </button>
          </div>

          <div className="space-y-2">
            {result.questions.map((q, i) => <QuestionCard key={i} q={q} />)}
          </div>

          {result.prep_tip && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-2.5 mt-2">
              <FiZap className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wide mb-0.5">Prep tip</p>
                <p className="text-xs text-amber-800 leading-relaxed">{result.prep_tip}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
