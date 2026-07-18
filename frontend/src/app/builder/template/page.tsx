"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useDropzone } from "react-dropzone";
import { uploadSampleCv, setSessionTemplate, getAccountProfile } from "@/lib/api";
import { getSessionId } from "@/lib/session";
import { useStepGuard } from "@/lib/stepGuard";
import { useAuth } from "@/lib/useAuth";
import { hasFeature } from "@/lib/config";
import Link from "next/link";
import clsx from "clsx";
import {
  FiUploadCloud, FiCheckCircle, FiFile, FiLock, FiZap, FiRefreshCw, FiX,
} from "react-icons/fi";
import {
  CATEGORY_COLORS, CATEGORY_HEADER, useCvTemplateInfos,
  type PreviewData, type TemplateInfo,
} from "@/components/TemplatePreviews";
import { getTemplateHtml } from "@/lib/templateHtml";
import { SAMPLE_PREVIEW, accountProfileToPreviewData } from "@/lib/resumePreview";
import AccentSwatches from "@/components/AccentSwatches";

// ── Helpers ───────────────────────────────────────────────────────────────────

type TemplateWithId = TemplateInfo & { _id: string };

// ── Gallery card — accent-colour header strip, text visible at a glance ─────

function GalleryCard({
  info, isSelected, locked, onPreview,
}: {
  info: TemplateWithId; isSelected: boolean; locked: boolean; onPreview: () => void;
}) {
  return (
    <button
      onClick={onPreview}
      disabled={locked}
      className={clsx(
        "relative flex flex-col text-left rounded-2xl overflow-hidden border-2 transition group",
        locked
          ? "opacity-50 cursor-not-allowed border-slate-200 bg-white"
          : isSelected
          ? "border-brand-500 shadow-lg scale-[1.02]"
          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-lg hover:-translate-y-0.5",
      )}
    >
      {/* Coloured header strip — shows template accent colour */}
      <div
        className="h-14 w-full flex items-end pb-2.5 px-3 shrink-0"
        style={{ background: info.accentColor }}
      >
        <div className="space-y-1 w-full">
          <div className="bg-white/80 h-2 w-28 rounded-full" />
          <div className="bg-white/40 h-1 w-16 rounded-full" />
        </div>
        {isSelected && !locked && (
          <FiCheckCircle className="w-4 h-4 text-white absolute top-2.5 right-2.5 shrink-0" />
        )}
        {locked && (
          <FiLock className="w-3.5 h-3.5 text-white/70 absolute top-2.5 right-2.5 shrink-0" />
        )}
      </div>

      {/* Card body */}
      <div className="p-3 flex flex-col flex-1">
        <div className="flex items-center gap-1 mb-1.5 flex-wrap">
          <span className={clsx("text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0", CATEGORY_COLORS[info.category])}>
            {info.category}
          </span>
          <span className="text-[9px] font-medium text-slate-400">{info.pages}p</span>
          {typeof info.quality_score === "number" && (
            <span
              title="CV-Score this template achieves with a strong resume"
              className={clsx("text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0",
                info.quality_score >= 85 ? "bg-emerald-50 text-emerald-700"
                  : info.quality_score >= 78 ? "bg-amber-50 text-amber-700"
                  : "bg-slate-100 text-slate-500")}
            >
              {info.quality_score}
            </span>
          )}
        </div>
        <p className="text-xs font-bold text-slate-900 leading-tight mb-1">{info.name}</p>
        <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2 flex-1">{info.description}</p>
        {!locked ? (
          <p className={clsx("text-[9px] font-semibold mt-2 transition",
            isSelected ? "text-brand-600" : "text-slate-300 group-hover:text-brand-400")}>
            {isSelected ? "✓ Selected" : "Click to preview"}
          </p>
        ) : (
          <Link href="/settings/plan" onClick={e => e.stopPropagation()}
            className="text-[9px] font-semibold text-brand-500 hover:underline mt-2">
            {info.tier === "pro" ? "Pro only" : "Plus / Pro"}
          </Link>
        )}
      </div>
    </button>
  );
}

// ── Template detail view — large preview + all info ───────────────────────────

// ── Template modal — full-screen overlay matching competitor design ───────────

function TemplateModal({
  info, previewData, personalised, isSelected, initialAccent, onSelect, onClose,
}: {
  info: TemplateWithId; previewData: PreviewData | null; personalised: boolean;
  isSelected: boolean; initialAccent: string | null;
  onSelect: (accent: string | null) => void; onClose: () => void;
}) {
  const SCALE    = 0.62;
  const IFRAME_W = 794;
  const PREVIEW_W = Math.round(IFRAME_W * SCALE);
  const PREVIEW_H = Math.round(IFRAME_W * 1.414 * SCALE);

  // Colour variant being previewed — live-recolours the iframe below.
  const [accent, setAccent] = useState<string | null>(initialAccent);

  // Lock the base page while the modal is open — wheel events must scroll the
  // modal panes (overscroll-contain), never the gallery behind it.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  const html = previewData ? getTemplateHtml(info.key, previewData, accent) : "";
  // Shows the user's OWN resume content when their profile is loaded, else sample.
  const isPersonalised = personalised;
  const hdr = CATEGORY_HEADER[info.category] ?? CATEGORY_HEADER["Classic"];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl overflow-hidden flex max-w-5xl w-full max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Left: live preview ── */}
        <div className="bg-slate-100 flex items-start justify-center p-6 shrink-0 overflow-y-auto overscroll-contain">
          <div
            className="rounded-lg shadow-xl overflow-hidden border border-slate-200"
            style={{ width: PREVIEW_W, height: PREVIEW_H, position: "relative", background: "#fff" }}
          >
            <iframe
              srcDoc={html}
              sandbox="allow-same-origin"
              scrolling="no"
              title={`${info.name} preview`}
              style={{
                position: "absolute", top: 0, left: 0,
                width: IFRAME_W,
                height: Math.round(IFRAME_W * 1.414),
                border: "none",
                transform: `scale(${SCALE})`,
                transformOrigin: "top left",
                pointerEvents: "none",
              }}
            />
          </div>
        </div>

        {/* ── Right: info panel ── */}
        <div className="flex-1 flex flex-col overflow-y-auto overscroll-contain">

          {/* Coloured header — category colour matches gallery card */}
          <div className={clsx("px-6 pt-5 pb-4 shrink-0", hdr.bg)}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={clsx("text-[10px] font-bold px-2.5 py-0.5 rounded-full", hdr.badge)}>
                  {info.category}
                </span>
                <span className="text-[10px] font-medium text-white/70">
                  {info.pages}-page
                </span>
                {info.tier === "plus" && (
                  <span className="text-[10px] font-bold bg-white/20 text-white px-2 py-0.5 rounded-full">Plus+</span>
                )}
                {info.tier === "pro" && (
                  <span className="text-[10px] font-bold bg-white/20 text-white px-2 py-0.5 rounded-full">Pro only</span>
                )}
                {typeof info.quality_score === "number" && (
                  <span className="text-[10px] font-bold bg-white/20 text-white px-2 py-0.5 rounded-full" title="CV-Score this template achieves">
                    Score {info.quality_score}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition shrink-0"
              >
                <FiX className="w-4 h-4 text-white" />
              </button>
            </div>
            <h2 className={clsx("text-2xl font-bold mt-2 leading-tight", hdr.text)}>{info.name}</h2>
            <p className="text-sm text-white/80 mt-1 leading-relaxed">{info.description}</p>
          </div>

          {/* Content */}
          <div className="px-6 py-4 space-y-5 flex-1">

            {/* Colour — pick a variant, the preview recolours live */}
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Template Colour</p>
              <AccentSwatches
                base={info.accentColor}
                variants={info.accent_variants ?? []}
                value={accent}
                onChange={setAccent}
              />
            </div>

            {/* Features */}
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2.5">Features</p>
              <ul className="space-y-2">
                {info.traits.map(trait => (
                  <li key={trait} className="flex items-center gap-2.5 text-sm text-slate-700">
                    <FiCheckCircle className="w-4 h-4 shrink-0" style={{ color: info.accentColor }} />
                    {trait}
                  </li>
                ))}
              </ul>
            </div>

            {/* Best for */}
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2.5">Best For</p>
              <div className="flex flex-wrap gap-1.5">
                {info.bestFor.split(",").map(s => (
                  <span key={s}
                    className="text-xs font-medium px-3 py-1 rounded-full border"
                    style={{ color: info.accentColor, borderColor: info.accentColor, background: `${info.accentColor}12` }}
                  >
                    {s.trim()}
                  </span>
                ))}
              </div>
            </div>

            {/* Preview note */}
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0",
                isPersonalised ? "bg-brand-500" : "bg-slate-300")} />
              {isPersonalised ? "Showing your resume content" : "Sample content — your CV fills this in after you generate"}
            </p>
          </div>

          {/* CTAs */}
          <div className="px-6 pb-6 pt-2 space-y-2 shrink-0 border-t border-slate-100">
            <button
              onClick={() => onSelect(accent)}
              className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98]"
              style={{ background: accent || info.accentColor }}
            >
              {isSelected
                ? <><FiCheckCircle className="w-4 h-4" /> Selected — click Continue below</>
                : <>Use this template →</>}
            </button>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition"
            >
              Back to gallery
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TemplatePage() {
  useStepGuard("template");
  const router = useRouter();
  const { data: session } = useAuth();
  const tier = session?.user?.tier ?? "free";
  // A template requires its own `tier` (driven by its quality score: 85+ → pro).
  // A user may use it only if their tier rank meets the template's.
  const TIER_RANK: Record<string, number> = { free: 0, plus: 1, pro: 2 };
  const userRank = TIER_RANK[tier] ?? 0;
  const isPro     = hasFeature(tier, "sample_cv");
  const canUseAll = tier === "plus" || tier === "pro";

  const [selected, setSelected]  = useState<string | null>(null);
  // Colour variant for the SELECTED template (null = template's own accent)
  const [accent, setAccentState] = useState<string | null>(null);
  const [detailId, setDetailId]  = useState<string | null>(null); // which template is previewed
  const [continuing, setContinuing] = useState(false);
  // Preview templates with the user's OWN content (from their profile / uploaded
  // resume); falls back to neutral sample content until it loads or if empty.
  const [previewData, setPreviewData] = useState<PreviewData>(SAMPLE_PREVIEW);

  // Sample CV (Pro)
  const [sampleFile, setSampleFile]           = useState<File | null>(null);
  const [uploadingSample, setUploadingSample] = useState(false);
  const [sampleUploaded, setSampleUploaded]   = useState(false);

  const templates = useCvTemplateInfos();
  // Each gallery card's id is its cv_template key — saved as selected_template_id.
  const templatesWithId: TemplateWithId[] = templates.map(info => ({ ...info, _id: info.key }));

  const detailInfo   = detailId ? (templatesWithId.find(t => t._id === detailId) ?? null) : null;
  const selectedInfo = selected ? (templatesWithId.find(t => t._id === selected) ?? null) : null;

  useEffect(() => {
    const savedTemplate = localStorage.getItem("cvtailora_template_id");
    if (savedTemplate) setSelected(savedTemplate);
    setAccentState(localStorage.getItem("cvtailora_accent") || null);
    // Preview with the user's own resume content when available.
    getAccountProfile()
      .then(p => { const pd = accountProfileToPreviewData(p); if (pd) setPreviewData(pd); })
      .catch(() => { /* keep sample */ });
  }, []);

  /** Set + persist the colour variant for the selected template. */
  function setAccent(a: string | null) {
    setAccentState(a);
    if (a) localStorage.setItem("cvtailora_accent", a);
    else localStorage.removeItem("cvtailora_accent");
  }

  const onDropSample = useCallback((files: File[]) => { if (files[0]) setSampleFile(files[0]); }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onDropSample,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    maxFiles: 1, maxSize: 5 * 1024 * 1024,
  });

  async function handleUploadSample() {
    if (!sampleFile) return;
    const sessionId = getSessionId();
    if (!sessionId) { toast.error("No session."); return; }
    setUploadingSample(true);
    try {
      const res = await uploadSampleCv(sessionId, sampleFile);
      setSampleUploaded(true);
      toast.success(`Formatting reference saved (${res.characters.toLocaleString()} chars)`);
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Upload failed.");
    } finally { setUploadingSample(false); }
  }

  // Save the chosen template on the session, then generate INTO it on the next
  // step. Picking the template first means the generator knows the exact page
  // budget up front (better page-fit) — the whole point of this step ordering.
  async function handleContinue() {
    if (!selected && !sampleUploaded) {
      toast.error("Pick a template (or upload a formatting reference) to continue.");
      return;
    }
    const sessionId = getSessionId();
    if (!sessionId) { toast.error("No session found."); return; }
    setContinuing(true);
    try {
      if (selected) {
        await setSessionTemplate(sessionId, selected, accent);
        localStorage.setItem("cvtailora_template_id", selected);
      }
      router.push("/builder/preview");
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Could not save your template.");
      setContinuing(false);
    }
  }

  // ── Gallery + modal overlay ───────────────────────────────────────────────

  return (
    <div className="w-full space-y-6">

      {/* Modal overlay — renders over the gallery */}
      {detailInfo && (
        <TemplateModal
          info={detailInfo}
          previewData={previewData}
          personalised={previewData !== SAMPLE_PREVIEW}
          isSelected={selected === detailInfo._id}
          initialAccent={selected === detailInfo._id ? accent : null}
          onSelect={(a) => { setSelected(detailInfo._id); setAccent(a); setDetailId(null); }}
          onClose={() => setDetailId(null)}
        />
      )}

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Choose a Template</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {canUseAll
            ? `All ${templates.length} templates — click any to preview with your CV content.`
            : `5 free templates · ${templates.length - 5} more on Plus / Pro — click to preview.`}
        </p>
      </div>

      {/* Selected template banner */}
      {selectedInfo && (
        <div className="flex items-center gap-3 bg-brand-50 border border-brand-200 rounded-xl px-4 py-3 flex-wrap">
          <FiCheckCircle className="w-4 h-4 text-brand-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-brand-800">
              {selectedInfo.name} selected
            </p>
            <p className="text-xs text-brand-600">{selectedInfo.description}</p>
          </div>
          <AccentSwatches
            base={selectedInfo.accentColor}
            variants={selectedInfo.accent_variants ?? []}
            value={accent}
            onChange={setAccent}
          />
          <button onClick={() => setDetailId(selectedInfo._id)}
            className="text-xs font-semibold text-brand-600 hover:underline shrink-0">
            Change
          </button>
        </div>
      )}

      {/* Template gallery */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
        {templatesWithId.map((info) => {
          const locked = userRank < (TIER_RANK[info.tier] ?? 0);
          return (
            <GalleryCard
              key={info._id}
              info={info}
              isSelected={selected === info._id}
              locked={locked}
              onPreview={() => !locked && setDetailId(info._id)}
            />
          );
        })}
      </div>

      {/* Upgrade nudge */}
      {!canUseAll && (
        <Link href="/settings/plan"
          className="card flex items-center gap-3 hover:border-brand-300 transition p-4">
          <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
            <FiLock className="w-4 h-4 text-brand-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-700">
              Unlock 10 more templates
              <span className="ml-1.5 text-[10px] font-semibold bg-brand-100 text-brand-700 rounded px-1.5 py-0.5">Plus+</span>
            </p>
            <p className="text-xs text-slate-500">Sidebar, Creative, Timeline, Two Column, Elegant and more.</p>
          </div>
          <FiZap className="w-4 h-4 text-brand-500 shrink-0" />
        </Link>
      )}

      {/* Sample CV — Pro only */}
      {isPro && <SampleCvCard
        sampleFile={sampleFile} setSampleFile={setSampleFile}
        uploadingSample={uploadingSample} sampleUploaded={sampleUploaded}
        onUpload={handleUploadSample}
        getRootProps={getRootProps} getInputProps={getInputProps} isDragActive={isDragActive}
      />}

      {/* Continue — saves the template, then the next step generates into it */}
      <button
        onClick={handleContinue}
        disabled={continuing || (!selected && !sampleUploaded)}
        className="w-full btn-primary py-4 text-base flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {continuing
          ? <><FiRefreshCw className="w-5 h-5 animate-spin" /> Saving…</>
          : <>Continue to Generate →</>}
      </button>

      <div className="flex justify-start pb-2">
        <button onClick={() => router.back()} className="btn-secondary">← Back</button>
      </div>
    </div>
  );
}

// ── Sample CV card (extracted for reuse in both gallery + detail view) ─────────

function SampleCvCard({
  sampleFile, setSampleFile, uploadingSample, sampleUploaded,
  onUpload, getRootProps, getInputProps, isDragActive,
}: {
  sampleFile: File | null;
  setSampleFile: (f: File | null) => void;
  uploadingSample: boolean;
  sampleUploaded: boolean;
  onUpload: () => void;
  getRootProps: () => object;
  getInputProps: () => object;
  isDragActive: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <FiFile className="w-3.5 h-3.5 text-brand-500" />
        <span className="text-sm font-semibold text-slate-800">Formatting Reference</span>
        <span className="text-xs text-slate-400 ml-1">(optional — overrides template)</span>
      </div>
      <p className="text-xs text-slate-500 mb-3">Upload your own CV as a layout guide. The AI mirrors its section structure without copying content.</p>
      {!sampleFile ? (
        <div {...getRootProps()}
          className={clsx("border-2 border-dashed rounded-lg py-4 text-center cursor-pointer transition",
            isDragActive ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-brand-400")}>
          <input {...getInputProps()} />
          <FiUploadCloud className="w-5 h-5 mx-auto text-slate-400 mb-1" />
          <p className="text-sm font-medium text-slate-600">{isDragActive ? "Drop it here!" : "Drag & drop a CV"}</p>
          <p className="text-xs text-slate-400 mt-0.5">PDF or DOCX · max 5 MB</p>
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
          <FiFile className="w-4 h-4 text-brand-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{sampleFile.name}</p>
            <p className="text-xs text-slate-400">{(sampleFile.size / 1024).toFixed(1)} KB</p>
          </div>
          {sampleUploaded ? (
            <span className="flex items-center gap-1 text-xs text-green-600 font-medium whitespace-nowrap">
              <FiCheckCircle className="w-3.5 h-3.5" /> Saved
            </span>
          ) : (
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setSampleFile(null)} className="text-xs text-slate-400 hover:text-red-500">Remove</button>
              <button onClick={onUpload} disabled={uploadingSample}
                className="btn-secondary text-xs py-1 px-2.5 disabled:opacity-50">
                {uploadingSample ? "Saving…" : "Use as reference"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

