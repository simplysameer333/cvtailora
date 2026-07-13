"use client";
import { useState, useEffect } from "react";
import { FiX, FiDownload, FiZap, FiFileText, FiUpload, FiLoader } from "react-icons/fi";
import { listSavedResumes, savedResumeDownloadUrl, type SavedResume } from "@/lib/api";
import { formatDateUtc } from "@/lib/datetime";
import Link from "next/link";

interface Props {
  open: boolean;
  onClose: () => void;
  onTailorNew: () => void;
  jobTitle?: string;
  employerName?: string;
}

function formatDate(iso: string) {
  return formatDateUtc(iso);
}

export default function ResumePickerModal({ open, onClose, onTailorNew, jobTitle, employerName }: Props) {
  const [resumes, setResumes] = useState<SavedResume[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listSavedResumes()
      .then(setResumes)
      .catch(() => setResumes([]))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-900">Use Saved Resume</h2>
            {(jobTitle || employerName) && (
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                For: {[jobTitle, employerName].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {loading && (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <FiLoader className="w-5 h-5 animate-spin mr-2" /> Loading resumes…
            </div>
          )}

          {!loading && resumes.length === 0 && (
            <div className="text-center py-10">
              <FiFileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500 mb-4">No saved resumes yet.</p>
              <Link href="/profile" onClick={onClose} className="btn-secondary text-sm gap-2">
                <FiUpload className="w-4 h-4" /> Go to Profile to add one
              </Link>
            </div>
          )}

          {!loading && resumes.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 hover:border-brand-300 transition">
              <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                <FiFileText className="w-4 h-4 text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{r.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  <span className={`inline-block rounded-full px-1.5 py-0.5 text-xs font-medium mr-1.5 ${
                    r.type === "tailored"
                      ? "bg-teal-50 text-teal-700"
                      : "bg-slate-100 text-slate-600"
                  }`}>
                    {r.type === "tailored" ? "Tailored" : "Uploaded"}
                  </span>
                  {r.tailored_for_employer && (
                    <span className="mr-1.5">{r.tailored_for_employer}</span>
                  )}
                  {formatDate(r.created_at)}
                </p>
              </div>
              <a
                href={savedResumeDownloadUrl(r.id)}
                download={`${r.name}.docx`}
                className="btn-primary text-xs px-3 py-1.5 gap-1 shrink-0"
                onClick={onClose}
              >
                <FiDownload className="w-3.5 h-3.5" /> Download
              </a>
            </div>
          ))}
        </div>

        {/* Footer — Tailor new option */}
        <div className="border-t border-slate-100 px-5 py-4">
          <button
            onClick={() => { onClose(); onTailorNew(); }}
            className="w-full btn-accent flex items-center justify-center gap-2"
          >
            <FiZap className="w-4 h-4" /> AI-Tailor a New Resume for This Job Instead
          </button>
        </div>
      </div>
    </div>
  );
}
