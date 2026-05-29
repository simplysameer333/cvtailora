"use client";
import { useState, useEffect } from "react";
import { FiBell, FiX, FiAlertCircle, FiArrowRight } from "react-icons/fi";
import toast from "react-hot-toast";
import TagInput from "@/components/TagInput";
import { createJobAlert, updateJobAlert, searchCatalogRoles, type JobAlert } from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (alert: JobAlert) => void;
  /** Pre-fill query/location when creating from current search. */
  initialQueryTags?: string[];
  initialLocationTags?: string[];
  /** Pass an existing alert to switch into edit mode. */
  editAlert?: JobAlert;
}

export default function CreateAlertModal({
  open,
  onClose,
  onSaved,
  initialQueryTags = [],
  initialLocationTags = [],
  editAlert,
}: Props) {
  const isEdit = !!editAlert;

  const [name, setName] = useState("");
  const [queryTags, setQueryTags] = useState<string[]>([]);
  const [locationTags, setLocationTags] = useState<string[]>([]);
  const [company, setCompany] = useState("");
  const [saving, setSaving] = useState(false);
  const [duplicateMsg, setDuplicateMsg] = useState<string | null>(null);

  // Clear duplicate warning whenever criteria change
  useEffect(() => { setDuplicateMsg(null); }, [queryTags, locationTags, company]);

  // Populate fields whenever the modal opens
  useEffect(() => {
    if (!open) return;
    setDuplicateMsg(null);
    if (isEdit && editAlert) {
      setName(editAlert.name);
      setQueryTags(editAlert.query_tags);
      setLocationTags(editAlert.location_tags);
      setCompany(editAlert.company ?? "");
    } else {
      setName(initialQueryTags.slice(0, 2).join(" + ") || "");
      setQueryTags(initialQueryTags);
      setLocationTags(initialLocationTags);
      setCompany("");
    }
  }, [open, isEdit, editAlert, initialQueryTags, initialLocationTags]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!queryTags.length && !company.trim()) {
      toast.error("Add at least one keyword or company name.");
      return;
    }
    if (!name.trim()) {
      toast.error("Give this alert a name.");
      return;
    }

    setSaving(true);
    setDuplicateMsg(null);
    try {
      const payload = {
        name: name.trim(),
        query_tags: queryTags,
        location_tags: locationTags,
        company: company.trim() || undefined,
      };

      const saved = isEdit
        ? await updateJobAlert(editAlert!.id, payload)
        : await createJobAlert(payload);

      toast.success(isEdit ? "Alert updated." : "Alert created! You'll get daily emails.");
      onSaved(saved);
      onClose();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      if (status === 409) {
        setDuplicateMsg(msg ?? "An alert with the same search criteria already exists.");
      } else {
        toast.error(msg ?? "Failed to save alert.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
              <FiBell className="w-4 h-4 text-brand-600" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">
              {isEdit ? "Edit Alert" : "Create Job Alert"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition p-1 rounded-lg hover:bg-slate-100"
            aria-label="Close"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5">

          {/* Alert name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-600">Alert name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Python jobs in London"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900
                         placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-200
                         focus:border-brand-400 transition"
            />
          </div>

          {/* Keywords */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-600">
              Keywords <span className="text-slate-400 font-normal">(job titles, skills)</span>
            </label>
            <TagInput
              value={queryTags}
              onChange={setQueryTags}
              fetchSuggestions={searchCatalogRoles}
              placeholder="Add keywords…"
            />
          </div>

          {/* Location */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-600">
              Location <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <TagInput
              value={locationTags}
              onChange={setLocationTags}
              fetchSuggestions={async () => []}
              placeholder="City, country, or Remote…"
            />
          </div>

          {/* Company */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-600">
              Company <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Google, Stripe…"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900
                         placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-200
                         focus:border-brand-400 transition"
            />
          </div>

          <p className="text-xs text-slate-400 -mt-1">
            You&apos;ll receive a daily email when new matching jobs are found.
          </p>

          {/* Duplicate warning */}
          {duplicateMsg && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <FiAlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-800">Already tracking this search</p>
                <p className="text-xs text-amber-700 mt-0.5">{duplicateMsg}</p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-900 transition"
                >
                  View in My Alerts <FiArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 btn-secondary text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 btn-primary text-sm"
            >
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create alert"}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
