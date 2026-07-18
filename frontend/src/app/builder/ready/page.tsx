"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  exportResume, downloadUrl, saveResumeFromSession,
  type GeneratedResume, type EvalSummary,
} from "@/lib/api";
import { getSessionId } from "@/lib/session";
import { useStepGuard } from "@/lib/stepGuard";
import { useAuth } from "@/lib/useAuth";
import { hasFeature } from "@/lib/config";
import {
  FiDownload, FiLock, FiBookmark, FiCheckCircle, FiRefreshCw, FiGrid, FiEdit2, FiEye, FiX,
} from "react-icons/fi";
import { useCvTemplateInfos } from "@/components/TemplatePreviews";
import { getTemplateHtml } from "@/lib/templateHtml";
import { toPreviewData, getFilename, SAMPLE_PREVIEW } from "@/lib/resumePreview";
import { EvalQualityPanel } from "@/components/EvalQualityPanel";

type ExportResult = { docx_file_id?: string; pdf_file_id?: string; pdf_error?: string };

const A4_W = 794;

/** Full A4 render of the resume, scaled to fit, scrollable for 2-page CVs. */
function ResumeFrame({ html }: { html: string }) {
  const SCALE = 0.78;
  const FRAME_H = Math.round(A4_W * 1.414 * 2); // room for up to 2 A4 pages
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-auto mx-auto" style={{ maxHeight: "76vh", width: Math.round(A4_W * SCALE) }}>
      <div style={{ width: Math.round(A4_W * SCALE), height: Math.round(FRAME_H * SCALE) }}>
        <iframe
          srcDoc={html}
          sandbox="allow-same-origin allow-scripts"
          scrolling="no"
          title="Your resume"
          style={{
            width: A4_W, height: FRAME_H, border: "none",
            transform: `scale(${SCALE})`, transformOrigin: "top left", pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}

/** Small non-interactive thumbnail of the selected template (top of an A4). */
function TemplateThumb({ html }: { html: string }) {
  const SCALE = 0.14;
  const THUMB_W = Math.round(A4_W * SCALE);
  const THUMB_H = Math.round(A4_W * 1.1 * SCALE); // just the top slice
  return (
    <div className="rounded-md border border-slate-200 bg-white overflow-hidden shrink-0" style={{ width: THUMB_W, height: THUMB_H }}>
      <iframe
        srcDoc={html}
        sandbox="allow-same-origin allow-scripts"
        scrolling="no"
        title="Selected template"
        style={{
          width: A4_W, height: Math.round(A4_W * 1.414), border: "none",
          transform: `scale(${SCALE})`, transformOrigin: "top left", pointerEvents: "none",
        }}
      />
    </div>
  );
}

export default function ReadyPage() {
  useStepGuard("ready");
  const router = useRouter();
  const { data: session } = useAuth();
  const tier = session?.user?.tier ?? "free";
  const canExportPdf   = hasFeature(tier, "pdf_export");
  const canSaveLibrary = hasFeature(tier, "save_to_library");

  const [resume, setResume]         = useState<GeneratedResume | null>(null);
  const [evalSummary, setEvalSummary] = useState<EvalSummary | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [accent, setAccent]         = useState<string | null>(null);

  const [files, setFiles]     = useState<ExportResult | null>(null);
  const [exporting, setExporting] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const templates = useCvTemplateInfos();
  const templateInfo = templateId ? templates.find(t => t.key === templateId) ?? null : null;

  useEffect(() => {
    try {
      const r = localStorage.getItem("cvtailora_generated");
      if (r) setResume(JSON.parse(r));
      const e = localStorage.getItem("cvtailora_eval_summary");
      if (e) setEvalSummary(JSON.parse(e));
    } catch { /* ignore */ }
    setTemplateId(localStorage.getItem("cvtailora_template_id"));
    setAccent(localStorage.getItem("cvtailora_accent") || null);
  }, []);

  // Prepare the downloadable DOCX/PDF once (the resume + template are already
  // chosen; this just renders them into files).
  useEffect(() => {
    const sessionId = getSessionId();
    if (!sessionId) { setExporting(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const boldKeywords = localStorage.getItem("cvtailora_bold_keywords") !== "false";
        const result = await exportResume(sessionId, canExportPdf, boldKeywords);
        if (cancelled) return;
        setFiles(result);
        if (result.pdf_error) toast(`PDF note: ${result.pdf_error}`, { icon: "⚠️", duration: 6000 });
      } catch (err: unknown) {
        if (!cancelled) toast.error((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Could not prepare your files.");
      } finally {
        if (!cancelled) setExporting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [canExportPdf]);

  const previewData = useMemo(() => (resume ? toPreviewData(resume) : null), [resume]);
  const templateHtml = useMemo(
    () => (templateId && previewData ? getTemplateHtml(templateId, previewData, accent) : ""),
    [templateId, previewData, accent],
  );
  const sampleHtml = useMemo(
    () => (templateId ? getTemplateHtml(templateId, SAMPLE_PREVIEW, accent) : ""),
    [templateId, accent],
  );

  async function handleSaveToLibrary() {
    const sessionId = getSessionId();
    if (!sessionId) return;
    const name = getFilename(resume).replace(/_/g, " ");
    setSaving(true);
    try {
      await saveResumeFromSession(sessionId, `Tailored — ${name}`);
      setSaved(true);
      toast.success("Saved to your Resume Library.");
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Could not save.");
    } finally { setSaving(false); }
  }

  const filename = getFilename(resume);

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Your Resume is Ready 🎉</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {templateInfo
            ? <>Rendered in the <span className="font-semibold text-slate-700">{templateInfo.name}</span> template. Download it below, or change the template / edit your content.</>
            : "Your tailored resume is ready to download."}
        </p>
      </div>

      {/* ── Selected-template reference (thumbnail + link, not a full render) ── */}
      <div className="card p-4 flex items-center gap-3 flex-wrap">
        {sampleHtml && <TemplateThumb html={sampleHtml} />}
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Selected template</p>
          <p className="text-sm font-bold text-slate-800">{templateInfo?.name ?? "—"}</p>
          {templateInfo && <p className="text-xs text-slate-500 line-clamp-1">{templateInfo.description}</p>}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            onClick={() => setShowPreview(true)}
            disabled={!templateHtml}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3 py-1.5 transition disabled:opacity-40"
          >
            <FiEye className="w-4 h-4" /> Preview resume
          </button>
          <button
            onClick={() => router.push("/builder/template")}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-brand-600 rounded-lg border border-slate-200 px-3 py-1.5 hover:border-brand-300 transition"
          >
            <FiGrid className="w-4 h-4" /> Change template
          </button>
          <button
            onClick={() => router.push("/builder/preview")}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-brand-600 rounded-lg border border-slate-200 px-3 py-1.5 hover:border-brand-300 transition"
          >
            <FiEdit2 className="w-4 h-4" /> Edit content
          </button>
        </div>
      </div>

      {/* ── Score + downloads, side by side on wide screens ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {evalSummary && <EvalQualityPanel evalSummary={evalSummary} />}

        <div className="card p-5 space-y-3">
          <h2 className="text-sm font-bold text-slate-800">Download</h2>
          {exporting ? (
            <div className="flex items-center gap-2 py-3 text-sm text-slate-500">
              <FiRefreshCw className="w-4 h-4 animate-spin" /> Preparing your files…
            </div>
          ) : (
            <>
              {files?.docx_file_id && (
                <a href={downloadUrl(files.docx_file_id)} download={`${filename}.docx`}
                  className="w-full flex items-center justify-center gap-2 btn-primary py-3 text-base">
                  <FiDownload className="w-5 h-5" /> Download Word (.docx)
                </a>
              )}
              {files?.pdf_file_id && (
                <a href={downloadUrl(files.pdf_file_id)} download={`${filename}.pdf`}
                  className="w-full flex items-center justify-center gap-2 btn-secondary py-3">
                  <FiDownload className="w-4 h-4" /> Download PDF
                </a>
              )}
              {!canExportPdf && (
                <Link href="/settings/plan"
                  className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-3 text-sm text-brand-600 font-medium hover:border-brand-300 transition">
                  <FiLock className="w-4 h-4" /> PDF export — Plus / Pro
                </Link>
              )}
              {!files?.docx_file_id && !files?.pdf_file_id && (
                <p className="text-sm text-slate-500">Couldn&apos;t prepare files — try refreshing this page.</p>
              )}
            </>
          )}
          {canSaveLibrary && (
            <button onClick={handleSaveToLibrary} disabled={saving || saved}
              className="w-full btn-secondary py-2.5 flex items-center justify-center gap-2">
              {saved ? <><FiCheckCircle className="w-4 h-4 text-teal-500" /> Saved to Library</>
                : saving ? <><FiRefreshCw className="w-4 h-4 animate-spin" /> Saving…</>
                : <><FiBookmark className="w-4 h-4" /> Save to Resume Library</>}
            </button>
          )}
          <Link href="/builder/upload"
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:border-brand-300 hover:text-brand-600 transition">
            Start a new resume →
          </Link>
        </div>
      </div>

      {/* ── Full-resume preview modal (kept out of the page flow so Ready stays short) ── */}
      {showPreview && templateHtml && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowPreview(false)}
        >
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col max-h-[94vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
              <span className="text-sm font-bold text-slate-800">
                Your resume {templateInfo ? `· ${templateInfo.name}` : ""}
              </span>
              <button
                onClick={() => setShowPreview(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center transition"
                title="Close"
              >
                <FiX className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="p-4 overflow-auto">
              <ResumeFrame html={templateHtml} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
