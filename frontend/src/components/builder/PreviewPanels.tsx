"use client";
// Presentational panels for the builder preview page (cover letter, locked
// facts, resume section editors, interview prep). Split out of
// builder/preview/page.tsx (2026-07-13, no-very-large-files) — all state stays
// in the page; these receive props/callbacks only.
import { useState, useRef } from "react";
import Link from "next/link";
import {
  FiRefreshCw, FiCheckCircle, FiLock, FiX, FiPlus, FiTrash2, FiZap,
  FiCopy, FiMail, FiBookOpen, FiChevronDown, FiChevronUp, FiMessageSquare,
} from "react-icons/fi";
import type { CoverLetterResult, InterviewPrepResult } from "@/lib/api";

function CoverLetterCard({
  coverLetter,
  loading,
  onGenerate,
  onRegenerate,
}: {
  coverLetter: CoverLetterResult | null;
  loading: boolean;
  onGenerate: () => void;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!coverLetter) return;
    const text = coverLetter.subject_line
      ? `Subject: ${coverLetter.subject_line}\n\n${coverLetter.full_text}`
      : coverLetter.full_text;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="card space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FiMail className="w-4 h-4 text-brand-500 shrink-0" />
          <div>
            <h2 className="font-semibold text-slate-800 text-sm">Cover Letter</h2>
            <p className="text-xs text-slate-400 mt-0.5">AI-generated cover letter tailored to this job description</p>
          </div>
        </div>
        {coverLetter && !loading && (
          <button
            onClick={onRegenerate}
            className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 disabled:opacity-50"
          >
            <FiRefreshCw className="w-3 h-3" />
            Regenerate
          </button>
        )}
      </div>

      {/* Generate button — shown when no cover letter yet */}
      {!coverLetter && !loading && (
        <button
          onClick={onGenerate}
          className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto"
        >
          <FiMail className="w-4 h-4" />
          Generate Cover Letter
        </button>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-3 py-4 text-sm text-slate-500">
          <span className="w-4 h-4 rounded-full border-2 border-brand-400 border-t-transparent animate-spin shrink-0" />
          Writing cover letter…
        </div>
      )}

      {/* Generated cover letter */}
      {coverLetter && !loading && (
        <div className="space-y-3">
          {coverLetter.subject_line && (
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Subject line</p>
              <p className="text-sm font-semibold text-slate-800">{coverLetter.subject_line}</p>
            </div>
          )}

          <div className="relative">
            <textarea
              readOnly
              className="input resize-none text-sm font-mono h-72 text-slate-700 bg-slate-50 cursor-default"
              value={coverLetter.full_text}
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-sm btn-secondary"
            >
              {copied
                ? <><FiCheckCircle className="w-3.5 h-3.5 text-teal-500" /> Copied!</>
                : <><FiCopy className="w-3.5 h-3.5" /> Copy to clipboard</>
              }
            </button>
            <button
              onClick={onRegenerate}
              disabled={loading}
              className="flex items-center gap-1.5 text-sm btn-secondary disabled:opacity-50"
            >
              <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Regenerate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LockedFactsPanel({
  facts,
  newFact,
  saving,
  onNewFactChange,
  onAdd,
  onRemove,
}: {
  facts: string[];
  newFact: string;
  saving: boolean;
  onNewFactChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); onAdd(); }
  }

  return (
    <div className="card">
      <button
        className="w-full flex items-center justify-between text-sm font-semibold text-slate-700 hover:text-brand-600"
        onClick={() => { setOpen((o) => !o); if (!open) setTimeout(() => inputRef.current?.focus(), 100); }}
      >
        <span className="flex items-center gap-2">
          <FiLock className="w-4 h-4 text-brand-500" />
          Locked Facts
          {facts.length > 0 && (
            <span className="text-xs font-normal bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">
              {facts.length} locked
            </span>
          )}
        </span>
        <span className="text-slate-400 text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-slate-500">
            Pin specific facts (company names, job titles, dates, degrees) that the AI must never change when regenerating.
          </p>

          {facts.length > 0 && (
            <ul className="space-y-1.5">
              {facts.map((fact, i) => (
                <li key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700">
                  <FiLock className="w-3 h-3 text-brand-400 shrink-0" />
                  <span className="flex-1">{fact}</span>
                  <button
                    onClick={() => onRemove(i)}
                    disabled={saving}
                    className="text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    aria-label="Remove"
                  >
                    <FiX className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2">
            <input
              ref={inputRef}
              className="input text-sm flex-1"
              placeholder='e.g. "Senior Engineer at Google, 2019–2023"'
              value={newFact}
              onChange={(e) => onNewFactChange(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={saving}
            />
            <button
              onClick={onAdd}
              disabled={saving || !newFact.trim()}
              className="btn-secondary flex items-center gap-1 text-sm disabled:opacity-50"
            >
              {saving ? <FiRefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FiPlus className="w-3.5 h-3.5" />}
              Lock
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
  onRegenerate,
  loading,
  comment,
  onCommentChange,
  onDelete,
  isPro = true,
}: {
  title: string;
  children: React.ReactNode;
  onRegenerate: (comment: string) => void;
  loading: boolean;
  comment: string;
  onCommentChange: (v: string) => void;
  onDelete?: () => void;
  isPro?: boolean;
}) {
  const [showFeedback, setShowFeedback] = useState(false);

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-800">{title}</h2>
        <div className="flex items-center gap-2">
          {onDelete && (
            <button
              onClick={onDelete}
              className="text-slate-300 hover:text-red-500 transition-colors"
              title="Remove section"
            >
              <FiTrash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {isPro ? (
            <>
              <button
                onClick={() => setShowFeedback((s) => !s)}
                className={`flex items-center gap-1 text-xs transition ${showFeedback || comment ? "text-brand-600" : "text-slate-400 hover:text-brand-500"}`}
              >
                <FiMessageSquare className="w-3 h-3" />
                {comment ? "Guidance added" : "Regenerate with guidance"}
              </button>
              <button
                onClick={() => onRegenerate("")}
                disabled={loading}
                className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 disabled:opacity-50"
              >
                <FiRefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
                Regenerate
              </button>
            </>
          ) : (
            <Link
              href="/settings/plan"
              title="Section-level regeneration is a Pro feature"
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-brand-600 transition"
            >
              <FiZap className="w-3 h-3" />
              Regenerate <span className="text-[10px] font-semibold bg-slate-100 text-slate-500 rounded px-1 py-0.5">PRO</span>
            </Link>
          )}
        </div>
      </div>

      {children}

      {showFeedback && isPro && (
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <textarea
            autoFocus
            className="input text-sm resize-none h-16"
            placeholder={`Feedback for ${title.toLowerCase()} — e.g. "highlight leadership and cross-team projects"`}
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
          />
          <div className="flex justify-between items-center">
            <button
              onClick={() => setShowFeedback(false)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Close
            </button>
            <button
              onClick={() => { onRegenerate(comment); setShowFeedback(false); }}
              disabled={loading || !comment.trim()}
              className="btn-primary text-xs py-1 px-3 disabled:opacity-40 flex items-center gap-1"
            >
              <FiRefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              Regenerate with feedback →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="input text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ── Interview Prep card ────────────────────────────────────────────────────────

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
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 transition"
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
            <ul className="space-y-1">
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

function InterviewPrepCard({
  prep,
  loading,
  onGenerate,
  onRegenerate,
}: {
  prep: InterviewPrepResult | null;
  loading: boolean;
  onGenerate: () => void;
  onRegenerate: () => void;
}) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FiBookOpen className="w-4 h-4 text-brand-500 shrink-0" />
          <div>
            <h2 className="font-semibold text-slate-800 text-sm">Interview Prep</h2>
            <p className="text-xs text-slate-400 mt-0.5">Targeted questions the interviewer is likely to ask you</p>
          </div>
        </div>
        {prep && !loading && (
          <button
            onClick={onRegenerate}
            className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
          >
            <FiRefreshCw className="w-3 h-3" />
            Regenerate
          </button>
        )}
      </div>

      {!prep && !loading && (
        <button
          onClick={onGenerate}
          className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto"
        >
          <FiBookOpen className="w-4 h-4" />
          Generate Interview Questions
        </button>
      )}

      {loading && (
        <div className="flex items-center gap-3 py-4 text-sm text-slate-500">
          <span className="w-4 h-4 rounded-full border-2 border-brand-400 border-t-transparent animate-spin shrink-0" />
          Preparing interview questions…
        </div>
      )}

      {prep && !loading && (
        <div className="space-y-2">
          {prep.questions.map((q, i) => <QuestionCard key={i} q={q} />)}
          {prep.prep_tip && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-2.5 mt-3">
              <FiZap className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wide mb-0.5">Prep tip</p>
                <p className="text-xs text-amber-800 leading-relaxed">{prep.prep_tip}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { CoverLetterCard, LockedFactsPanel, Section, EditableField, InterviewPrepCard };
