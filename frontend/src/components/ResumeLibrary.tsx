"use client";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  FiFileText, FiLoader, FiPlus, FiLock, FiEye, FiEdit2, FiDownload, FiTrash2,
} from "react-icons/fi";
import {
  listSavedResumes, uploadSavedResume, deleteSavedResume, renameSavedResume,
  savedResumeDownloadUrl, type SavedResume,
} from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { hasFeature, getTierLimit } from "@/lib/config";
import ResumePreviewModal from "./ResumePreviewModal";

/**
 * Shared Resume Library — one component for every place saved resumes appear
 * (My Profile, CV Builder upload, Cover Letter, Interview Prep).
 *
 * variant "full"   — manage mode: upload / rename / delete / download / preview.
 * variant "picker" — select mode: preview + a CTA per row (onUseResume).
 */
export default function ResumeLibrary({
  variant = "full",
  ctaLabel = "Use this resume",
  onUseResume,
  busyId = null,
  requireText = false,
  title = "Resume Library",
  subtitle,
}: {
  variant?: "full" | "picker";
  ctaLabel?: string;
  onUseResume?: (resume: SavedResume) => void;
  /** Row id currently processing — disables all CTAs, spins that row */
  busyId?: string | null;
  /** Picker rows need resume_text (e.g. copy-into-form use cases) */
  requireText?: boolean;
  title?: string;
  subtitle?: string;
}) {
  const { data: session } = useAuth();
  const tier = session?.user?.tier ?? "free";
  const canUse = hasFeature(tier, "resume_library");
  const limit = getTierLimit(tier, "resume_library");

  const [library, setLibrary] = useState<SavedResume[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [previewResume, setPreviewResume] = useState<SavedResume | null>(null);

  useEffect(() => {
    if (!canUse) return;
    setLoading(true);
    listSavedResumes().then(setLibrary).catch(() => {}).finally(() => setLoading(false));
  }, [canUse]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const saved = await uploadSavedResume(file, file.name.replace(/\.[^.]+$/, ""));
      setLibrary((prev) => [saved, ...prev]);
      toast.success("Resume added to library.");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteSavedResume(id);
      setLibrary((prev) => prev.filter((r) => r.id !== id));
      toast.success("Removed.");
    } catch { toast.error("Could not delete."); }
  }

  async function handleRename(id: string) {
    if (!editingName.trim()) return;
    try {
      const updated = await renameSavedResume(id, editingName.trim());
      setLibrary((prev) => prev.map((r) => r.id === id ? updated : r));
      setEditingId(null);
    } catch { toast.error("Could not rename."); }
  }

  if (!canUse) {
    return (
      <div className="card">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2 mb-3">
          <FiFileText className="w-4 h-4" /> {title}
        </h2>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center">
          <FiLock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-600">Resume Library is a Plus feature</p>
          <p className="text-xs text-slate-400 mt-1">Upgrade to save multiple resumes and reuse them everywhere.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <FiFileText className="w-4 h-4" /> {title}
            <span className="text-xs font-normal text-slate-400">
              {limit === null ? `${library.length} saved` : `${library.length} / ${limit} used`}
            </span>
          </h2>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {variant === "full" && (
          <label className={`btn-secondary text-xs px-3 py-1.5 gap-1.5 cursor-pointer shrink-0 ${
            uploading || (limit !== null && library.length >= limit) ? "opacity-50 pointer-events-none" : ""
          }`}>
            {uploading
              ? <><FiLoader className="w-3.5 h-3.5 animate-spin" /> Uploading…</>
              : <><FiPlus className="w-3.5 h-3.5" /> Add Resume</>}
            <input
              type="file" accept=".pdf,.docx" className="hidden"
              onChange={handleUpload}
              disabled={uploading || (limit !== null && library.length >= limit)}
            />
          </label>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8 text-slate-400">
          <FiLoader className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      )}

      {!loading && library.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-slate-400 text-sm">
          No resumes saved yet. Upload one on the Profile page or save a tailored resume from the builder.
        </div>
      )}

      {!loading && library.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {library.map((r) => {
            const noText = requireText && !r.resume_text;
            return (
              <div key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center shrink-0">
                  <FiFileText className="w-4 h-4 text-brand-600" />
                </div>
                <div className="flex-1 min-w-0">
                  {editingId === r.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleRename(r.id); if (e.key === "Escape") setEditingId(null); }}
                        className="input text-sm py-1 px-2 h-7"
                      />
                      <button onClick={() => handleRename(r.id)} className="text-xs text-brand-600 font-medium hover:underline">Save</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-slate-900 truncate">{r.name}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span className={`rounded-full px-1.5 py-0.5 font-medium ${
                      r.type === "tailored" ? "bg-teal-50 text-teal-700" : "bg-slate-200 text-slate-600"
                    }`}>
                      {r.type === "tailored" ? "Tailored" : "Uploaded"}
                    </span>
                    {r.tailored_for_employer && <span className="truncate">{r.tailored_for_employer}</span>}
                    {new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setPreviewResume(r)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition"
                    title="Preview"
                  >
                    <FiEye className="w-3.5 h-3.5" />
                  </button>

                  {variant === "full" ? (
                    <>
                      <button
                        onClick={() => { setEditingId(r.id); setEditingName(r.name); }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition"
                        title="Rename"
                      >
                        <FiEdit2 className="w-3.5 h-3.5" />
                      </button>
                      <a
                        href={savedResumeDownloadUrl(r.id)} download
                        className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition"
                        title="Download"
                      >
                        <FiDownload className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition"
                        title="Delete"
                      >
                        <FiTrash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => onUseResume?.(r)}
                      disabled={!!busyId || noText}
                      title={noText ? "No text available for this resume" : ctaLabel}
                      className="btn-primary text-xs px-3 py-1.5 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      {busyId === r.id
                        ? <><FiLoader className="w-3.5 h-3.5 animate-spin" /> Loading…</>
                        : ctaLabel}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ResumePreviewModal resume={previewResume} onClose={() => setPreviewResume(null)} />
    </div>
  );
}
