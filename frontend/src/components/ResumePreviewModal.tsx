"use client";
import { useEffect, useState } from "react";
import { FiX, FiLoader, FiDownload, FiFileText } from "react-icons/fi";
import api, { savedResumeDownloadUrl, type SavedResume } from "@/lib/api";

/**
 * Full-screen resume preview modal. PDFs render inline via an authenticated
 * blob fetch; DOCX/tailored resumes fall back to the stored plain text.
 * Overlay blocks all background interaction; × button / backdrop / Esc close it.
 */
export default function ResumePreviewModal({
  resume,
  onClose,
}: {
  resume: SavedResume | null;
  onClose: () => void;
}) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPdf = resume?.content_type === "application/pdf";

  // Lock background scroll while open
  useEffect(() => {
    if (!resume) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [resume]);

  // Esc closes
  useEffect(() => {
    if (!resume) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resume, onClose]);

  // Fetch PDF bytes with auth → object URL for the iframe
  useEffect(() => {
    if (!resume || !isPdf) return;
    let url: string | null = null;
    setLoading(true);
    setError(null);
    api.get(`/api/account/resumes/${resume.id}/download`, { responseType: "blob" })
      .then((res) => {
        url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
        setPdfUrl(url);
      })
      .catch(() => setError("Could not load the file. Try downloading it instead."))
      .finally(() => setLoading(false));
    return () => {
      if (url) URL.revokeObjectURL(url);
      setPdfUrl(null);
    };
  }, [resume, isPdf]);

  if (!resume) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${resume.name}`}
    >
      {/* Backdrop — blocks and dims the page; click closes */}
      <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center shrink-0">
              <FiFileText className="w-4 h-4 text-brand-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{resume.name}</p>
              <p className="text-[11px] text-slate-400">
                {resume.type === "tailored" ? "AI Tailored" : resume.file_name ?? "Uploaded"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={savedResumeDownloadUrl(resume.id)}
              download
              className="btn-secondary text-xs px-3 py-1.5 gap-1.5"
            >
              <FiDownload className="w-3.5 h-3.5" /> Download
            </a>
            <button
              onClick={onClose}
              title="Close preview"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 bg-slate-100">
          {isPdf ? (
            loading ? (
              <div className="h-full flex items-center justify-center text-slate-400">
                <FiLoader className="w-6 h-6 animate-spin mr-2" /> Loading preview…
              </div>
            ) : error ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-500 px-8 text-center">{error}</div>
            ) : pdfUrl ? (
              /* Thumbnails stay for page navigation; the wide (max-w-6xl) modal keeps the document area dominant */
              <iframe src={`${pdfUrl}#view=FitH`} title={`Preview of ${resume.name}`} className="w-full h-full border-0" />
            ) : null
          ) : resume.resume_text ? (
            <div className="h-full overflow-y-auto px-6 sm:px-10 py-6">
              <div className="max-w-3xl mx-auto bg-white rounded-xl border border-slate-200 shadow-sm px-6 sm:px-10 py-8">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-4">
                  Text preview — download for the formatted document
                </p>
                <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 leading-relaxed">
                  {resume.resume_text}
                </pre>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-slate-500 px-8 text-center">
              No inline preview available for this file — use Download to view it.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
