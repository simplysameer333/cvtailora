"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { FiX, FiCopy, FiLink, FiTrash2, FiLoader, FiGlobe } from "react-icons/fi";
import { revokeResumeShare, type SavedResume } from "@/lib/api";

/**
 * Share-link modal for a Resume Library resume — shows the public read-only
 * URL with copy + revoke actions. The link is created by the host component
 * BEFORE opening this modal (so it always has a token to show).
 */
export default function ShareResumeModal({
  resume,
  token,
  onClose,
  onRevoked,
}: {
  resume: SavedResume;
  token: string;
  onClose: () => void;
  onRevoked: (resumeId: string) => void;
}) {
  const [revoking, setRevoking] = useState(false);
  const shareUrl = `${window.location.origin}/share/${token}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied to clipboard.");
    } catch {
      toast.error("Could not copy — select and copy the link manually.");
    }
  }

  async function handleRevoke() {
    setRevoking(true);
    try {
      await revokeResumeShare(resume.id);
      toast.success("Share link revoked — it no longer works.");
      onRevoked(resume.id);
      onClose();
    } catch {
      toast.error("Could not revoke the link.");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <FiGlobe className="w-4 h-4 text-brand-600" /> Share “{resume.name}”
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Anyone with this link can view (not edit) this resume — no account needed.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition">
            <FiX className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 min-w-0">
            <FiLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-xs text-slate-600 truncate select-all">{shareUrl}</span>
          </div>
          <button onClick={handleCopy} className="btn-primary text-xs px-3 py-2 gap-1.5 shrink-0">
            <FiCopy className="w-3.5 h-3.5" /> Copy
          </button>
        </div>

        <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-400">Revoking kills the link instantly.</p>
          <button
            onClick={handleRevoke}
            disabled={revoking}
            className="flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-600 disabled:opacity-50 transition"
          >
            {revoking
              ? <><FiLoader className="w-3.5 h-3.5 animate-spin" /> Revoking…</>
              : <><FiTrash2 className="w-3.5 h-3.5" /> Revoke link</>}
          </button>
        </div>
      </div>
    </div>
  );
}
