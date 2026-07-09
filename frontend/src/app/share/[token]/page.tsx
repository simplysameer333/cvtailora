"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { FiDownload, FiLoader, FiAlertCircle, FiFileText } from "react-icons/fi";
import { getSharedResume, sharedResumeFileUrl, type SharedResumeView } from "@/lib/api";
import Logo from "@/components/Logo";

/**
 * Public read-only resume view (/share/[token]) — NO account required.
 * Standalone page (no SidebarShell): clean header, the resume, a subtle CTA.
 * PDFs render inline in an iframe; everything else falls back to resume_text.
 */
export default function SharedResumePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";

  const [resume, setResume] = useState<SharedResumeView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getSharedResume(token)
      .then(setResume)
      .catch((err: unknown) => {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setError(msg ?? "This share link does not exist or was revoked.");
      });
  }, [token]);

  const isPdf = resume?.content_type === "application/pdf" && resume?.has_file;

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/"><Logo size="sm" /></Link>
          {resume && resume.has_file && (
            <a
              href={sharedResumeFileUrl(token)}
              download
              className="btn-secondary text-xs px-3 py-1.5 gap-1.5"
            >
              <FiDownload className="w-3.5 h-3.5" /> Download
            </a>
          )}
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-8">
        {!resume && !error && (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <FiLoader className="w-6 h-6 animate-spin mr-2" /> Loading resume…
          </div>
        )}

        {error && (
          <div className="card text-center py-16 flex flex-col items-center gap-3">
            <FiAlertCircle className="w-10 h-10 text-slate-300" />
            <p className="font-medium text-slate-600">{error}</p>
            <p className="text-sm text-slate-400">
              Ask the owner for a new link, or{" "}
              <Link href="/" className="text-brand-600 hover:underline">build your own CV</Link>.
            </p>
          </div>
        )}

        {resume && (
          <>
            <div className="flex items-center gap-2 mb-4">
              <FiFileText className="w-4 h-4 text-brand-600" />
              <h1 className="font-semibold text-slate-900">{resume.name}</h1>
              <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
                Read-only
              </span>
            </div>

            {isPdf ? (
              <iframe
                src={sharedResumeFileUrl(token)}
                title={resume.name}
                className="w-full rounded-xl border border-slate-200 bg-white shadow-sm"
                style={{ height: "80vh" }}
              />
            ) : resume.resume_text ? (
              <div className="card whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
                {resume.resume_text}
              </div>
            ) : (
              <div className="card text-center py-16 text-slate-400 text-sm">
                This resume has no viewable content.
              </div>
            )}
          </>
        )}
      </main>

      {/* Virality footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-center gap-2 text-xs text-slate-400">
          Shared via
          <Link href="/" className="font-semibold text-brand-600 hover:underline">
            TailorMyCv
          </Link>
          — AI-tailored resumes for every application
        </div>
      </footer>
    </div>
  );
}
