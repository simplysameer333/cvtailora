"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useDropzone } from "react-dropzone";
import { listTemplates, uploadSampleCv, type Template } from "@/lib/api";
import { getSessionId } from "@/lib/session";
import { useStepGuard } from "@/lib/stepGuard";
import clsx from "clsx";
import { FiUploadCloud, FiCheckCircle, FiFile, FiFileText, FiLayers } from "react-icons/fi";

type OutputFormat = "docx" | "pdf" | "both";

const FORMAT_OPTIONS: { value: OutputFormat; label: string; sub: string; icon: React.ElementType }[] = [
  { value: "docx", label: "DOCX", sub: "Word document", icon: FiFileText },
  { value: "pdf",  label: "PDF",  sub: "PDF document",  icon: FiFile },
  { value: "both", label: "Both", sub: "DOCX + PDF",    icon: FiLayers },
];

const PREVIEW_PLACEHOLDERS: Record<string, string> = {
  Clean: "🗒️", Modern: "🎨", Executive: "🏛️",
};

const LS_INSTRUCTIONS  = "tailormycv_instructions";
const LS_OUTPUT_FORMAT = "tailormycv_output_format";

export default function TemplatePage() {
  useStepGuard("template");
  const router = useRouter();
  const [templates, setTemplates]             = useState<Template[]>([]);
  const [selected, setSelected]               = useState<string | null>(null);
  const [instructions, setInstructions]       = useState("");
  const [sampleFile, setSampleFile]           = useState<File | null>(null);
  const [uploadingSample, setUploadingSample] = useState(false);
  const [sampleUploaded, setSampleUploaded]   = useState(false);
  const [outputFormat, setOutputFormat]       = useState<OutputFormat>("docx");

  useEffect(() => {
    listTemplates().then(setTemplates).catch(() => toast.error("Could not load templates."));
    const saved = localStorage.getItem(LS_INSTRUCTIONS);
    if (saved) setInstructions(saved);
    const savedFmt = localStorage.getItem(LS_OUTPUT_FORMAT) as OutputFormat | null;
    if (savedFmt) setOutputFormat(savedFmt);
  }, []);

  const onDropSample = useCallback((files: File[]) => {
    if (files[0]) setSampleFile(files[0]);
  }, []);

  const { getRootProps: getSampleRootProps, getInputProps: getSampleInputProps, isDragActive: isSampleDrag } = useDropzone({
    onDrop: onDropSample,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024,
  });

  async function handleUploadSample() {
    if (!sampleFile) return;
    const sessionId = getSessionId();
    if (!sessionId) { toast.error("No session — please start from Step 1."); return; }
    setUploadingSample(true);
    try {
      const res = await uploadSampleCv(sessionId, sampleFile);
      setSampleUploaded(true);
      toast.success(`Formatting reference saved (${res.characters.toLocaleString()} chars)`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Upload failed.";
      toast.error(msg);
    } finally { setUploadingSample(false); }
  }

  function handleContinue() {
    if (!selected && !sampleUploaded) { toast.error("Select a template or upload a formatting reference."); return; }
    if (selected) localStorage.setItem("tailormycv_template_id", selected);
    localStorage.setItem(LS_INSTRUCTIONS, instructions);
    localStorage.setItem(LS_OUTPUT_FORMAT, outputFormat);
    router.push("/builder/preview");
  }

  const canContinue = !!(selected || sampleUploaded);

  return (
    <div className="max-w-2xl mx-auto space-y-4">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Choose a Template</h1>
        <p className="text-sm text-slate-500 mt-0.5">Pick a design, or upload a formatting reference to skip this step.</p>
      </div>

      {/* Template gallery — 3 prebuilt cards */}
      <div className="grid grid-cols-3 gap-3">
        {templates.map((t) => (
          <button
            key={t._id}
            onClick={() => setSelected(t._id)}
            className={clsx(
              "relative card p-4 text-left transition hover:border-brand-400 hover:shadow-md",
              selected === t._id ? "border-brand-500 ring-2 ring-brand-200" : "border-slate-200",
            )}
          >
            {selected === t._id && (
              <FiCheckCircle className="absolute top-3 right-3 w-4 h-4 text-brand-500" />
            )}
            <div className="h-24 rounded-lg bg-slate-100 flex items-center justify-center text-4xl mb-3">
              {PREVIEW_PLACEHOLDERS[t.name] ?? "📄"}
            </div>
            <p className="font-semibold text-sm">{t.name}</p>
            {t.description && (
              <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-snug">{t.description}</p>
            )}
          </button>
        ))}
      </div>

      {/* Formatting reference */}
      <div className="card p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <FiFile className="w-3.5 h-3.5 text-brand-500" />
          <span className="text-sm font-semibold text-slate-800">Formatting Reference</span>
          <span className="text-xs text-slate-400 ml-1">(optional — skips template selection)</span>
        </div>

        {!sampleFile ? (
          <div
            {...getSampleRootProps()}
            className={clsx(
              "border-2 border-dashed rounded-lg py-4 text-center cursor-pointer transition",
              isSampleDrag ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-brand-400",
            )}
          >
            <input {...getSampleInputProps()} />
            <FiUploadCloud className="w-5 h-5 mx-auto text-slate-400 mb-1" />
            <p className="text-sm font-medium text-slate-600">{isSampleDrag ? "Drop it here!" : "Drag & drop a CV"}</p>
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
                <button onClick={handleUploadSample} disabled={uploadingSample} className="btn-secondary text-xs py-1 px-2.5 disabled:opacity-50">
                  {uploadingSample ? "Saving…" : "Use as reference"}
                </button>
              </div>
            )}
          </div>
        )}

        {sampleUploaded && !selected && (
          <p className="text-xs text-brand-600 mt-2 flex items-center gap-1">
            <FiCheckCircle className="w-3 h-3" /> Will be used as layout guide — no template needed
          </p>
        )}
      </div>

      {/* Output format */}
      <div className="card p-4">
        <p className="text-sm font-semibold text-slate-800 mb-3">Output Format</p>
        <div className="flex gap-3">
          {FORMAT_OPTIONS.map(({ value, label, sub, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setOutputFormat(value)}
              className={clsx(
                "flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition text-sm font-medium",
                outputFormat === value
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-slate-200 hover:border-brand-300 text-slate-600",
              )}
            >
              <Icon className="w-5 h-5" />
              {label}
              <span className="text-xs font-normal text-slate-400">{sub}</span>
            </button>
          ))}
        </div>
        {(outputFormat === "pdf" || outputFormat === "both") && (
          <p className="text-xs text-amber-600 mt-2">Requires LibreOffice on server; falls back to DOCX if unavailable.</p>
        )}
      </div>

      {/* Additional instructions */}
      <div className="card p-4">
        <label className="text-sm font-semibold text-slate-800">
          Additional Instructions <span className="text-xs font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          className="input resize-none text-sm mt-2 h-36"
          placeholder={`e.g. "Focus on leadership experience", "I'm switching to product management", "Emphasise open-source work"`}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center pb-2">
        <button onClick={() => router.back()} className="btn-secondary">← Back</button>
        <div className="relative group">
          {!canContinue && (
            <div className="absolute bottom-full mb-2 right-0 w-56 bg-slate-800 text-white text-xs rounded-lg px-3 py-2 text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              Select a template or upload a formatting reference to continue.
              <span className="absolute top-full right-4 border-4 border-transparent border-t-slate-800" />
            </div>
          )}
          <button
            onClick={handleContinue}
            disabled={!canContinue}
            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continue →
          </button>
        </div>
      </div>

    </div>
  );
}
