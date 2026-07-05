"use client";
import { useEffect } from "react";
import { FiX, FiExternalLink, FiCpu } from "react-icons/fi";
import type { Job } from "@/lib/api";

/**
 * "How would you like to apply?" — manual apply opens the job page; the
 * AI-agent option is surfaced now (Coming soon) ahead of the auto-apply build.
 */
export default function ApplyChoiceModal({
  job,
  onClose,
  onManual,
}: {
  job: Job | null;
  onClose: () => void;
  onManual: (job: Job) => void;
}) {
  useEffect(() => {
    if (!job) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [job, onClose]);

  if (!job) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl p-6">
        <button
          onClick={onClose}
          title="Close"
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
        >
          <FiX className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-bold text-slate-900 pr-8">How would you like to apply?</h2>
        <p className="text-sm text-slate-500 mt-1 mb-5">
          {job.job_title}
          {job.employer_name ? ` at ${job.employer_name}` : ""}
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => { onManual(job); onClose(); }}
            className="flex items-start gap-3 rounded-xl border border-slate-200 hover:border-brand-400 hover:bg-brand-50 px-4 py-3.5 text-left transition"
          >
            <FiExternalLink className="w-5 h-5 text-brand-600 mt-0.5 shrink-0" />
            <span>
              <span className="block text-sm font-semibold text-slate-900">Apply Manually</span>
              <span className="block text-xs text-slate-500 mt-0.5">Open the job application page in a new tab</span>
            </span>
          </button>

          <div
            className="flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50/60 px-4 py-3.5 text-left opacity-80 cursor-not-allowed"
            title="Coming soon"
          >
            <FiCpu className="w-5 h-5 text-teal-600 mt-0.5 shrink-0" />
            <span className="flex-1">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                Apply Automatically with AI Agent
                <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">
                  Coming soon
                </span>
              </span>
              <span className="block text-xs text-slate-500 mt-0.5">
                The agent fills the application from your profile and tracks its status for you
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
