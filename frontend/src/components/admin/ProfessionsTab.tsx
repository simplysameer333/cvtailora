"use client";
import { useEffect, useState } from "react";
import {
  adminCreateProfession, adminUpdateProfession, adminDeleteProfession,
  type AdminProfession,
} from "@/lib/api";
import {
  FiChevronDown, FiChevronUp, FiToggleLeft, FiToggleRight,
  FiTrash2, FiPlus, FiSave,
} from "react-icons/fi";
import { TabHeader, Spinner } from "./shared";

// ── Professions tab ────────────────────────────────────────────────────────────

type ProfessionPromptKey = "generator_context" | "evaluator_context" | "scoring_criteria" | "aggregator_context";

const PROMPT_FIELDS: { key: ProfessionPromptKey; label: string; rows: number }[] = [
  { key: "generator_context",  label: "Generator context (appended to generator system prompt)", rows: 6 },
  { key: "evaluator_context",  label: "Evaluator context (appended to all evaluator prompts)", rows: 5 },
  { key: "scoring_criteria",   label: "Scoring criteria (replaces default evaluator scoring guide)", rows: 7 },
  { key: "aggregator_context", label: "Aggregator context (shapes feedback aggregation)", rows: 4 },
];

const EMPTY_PROFESSION: Omit<AdminProfession, "is_active" | "created_at" | "updated_at"> = {
  slug: "", display_name: "", keywords: [],
  generator_context: "", evaluator_context: "",
  scoring_criteria: "", aggregator_context: "", evaluator_names: [],
};

function ProfessionCard({
  profession, onSaved, onDeleted,
}: {
  profession: AdminProfession;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AdminProfession>({ ...profession });
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { setDraft({ ...profession }); }, [profession]);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(profession);
  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(""), 3000); }

  async function handleSave() {
    setSaving(true);
    try {
      await adminUpdateProfession(profession.slug, {
        display_name: draft.display_name, keywords: draft.keywords,
        generator_context: draft.generator_context, evaluator_context: draft.evaluator_context,
        scoring_criteria: draft.scoring_criteria, aggregator_context: draft.aggregator_context,
        evaluator_names: draft.evaluator_names,
      });
      flash("Saved");
      onSaved();
    } catch { flash("Save failed"); }
    finally { setSaving(false); }
  }

  async function handleToggle() {
    setToggling(true);
    try {
      await adminUpdateProfession(profession.slug, { is_active: !profession.is_active });
      flash(profession.is_active ? "Deactivated" : "Activated");
      onSaved();
    } catch { flash("Failed"); }
    finally { setToggling(false); }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${profession.display_name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try { await adminDeleteProfession(profession.slug); onDeleted(); }
    catch { flash("Delete failed"); }
    finally { setDeleting(false); }
  }

  return (
    <div className={`card mb-3 ${!profession.is_active ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 flex-1 text-left">
          {open ? <FiChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <FiChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
          <div>
            <span className="font-semibold text-slate-800">{profession.display_name}</span>
            <span className="ml-2 text-xs font-mono text-slate-400">{profession.slug}</span>
            {!profession.is_active && <span className="ml-2 text-xs bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">Inactive</span>}
          </div>
        </button>
        <div className="flex items-center gap-2 ml-3">
          {msg && <span className={`text-xs font-medium ${msg.includes("fail") || msg.includes("Failed") ? "text-red-600" : "text-green-600"}`}>{msg}</span>}
          <button onClick={handleToggle} disabled={toggling} title={profession.is_active ? "Deactivate" : "Activate"} className="text-slate-400 hover:text-slate-600 disabled:opacity-50">
            {profession.is_active ? <FiToggleRight className="w-5 h-5 text-teal-600" /> : <FiToggleLeft className="w-5 h-5" />}
          </button>
          {profession.slug !== "generic" && (
            <button onClick={handleDelete} disabled={deleting} title="Delete" className="text-slate-400 hover:text-red-500 disabled:opacity-50">
              <FiTrash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Display name</label>
            <input value={draft.display_name} onChange={e => setDraft(d => ({ ...d, display_name: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Keywords (comma-separated — matched against target role)</label>
            <input
              value={draft.keywords.join(", ")}
              onChange={e => setDraft(d => ({ ...d, keywords: e.target.value.split(",").map(k => k.trim()).filter(Boolean) }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
          </div>
          {PROMPT_FIELDS.map(f => (
            <div key={f.key}>
              <label className="block text-xs font-semibold text-slate-500 mb-1">{f.label}</label>
              <textarea rows={f.rows} value={String(draft[f.key] ?? "")}
                onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-300 resize-y" />
            </div>
          ))}
          <button onClick={handleSave} disabled={saving || !isDirty}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition">
            <FiSave className="w-3.5 h-3.5" />
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}

function NewProfessionForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ ...EMPTY_PROFESSION });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function handleCreate() {
    if (!draft.slug.trim() || !draft.display_name.trim()) { setErr("Slug and display name are required."); return; }
    setSaving(true); setErr("");
    try {
      await adminCreateProfession({ ...draft, slug: draft.slug.trim().toLowerCase().replace(/\s+/g, "_") });
      setDraft({ ...EMPTY_PROFESSION }); setOpen(false); onCreated();
    } catch { setErr("Create failed — slug may already exist."); }
    finally { setSaving(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-dashed border-slate-300 text-slate-500 text-sm hover:border-brand-400 hover:text-brand-600 transition w-full justify-center mt-2">
        <FiPlus className="w-4 h-4" /> New profession
      </button>
    );
  }

  return (
    <div className="card mt-3 border-brand-200 bg-brand-50/30">
      <h3 className="font-semibold text-slate-800 mb-4">New profession</h3>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Slug (unique, lowercase)</label>
            <input value={draft.slug} onChange={e => setDraft(d => ({ ...d, slug: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="e.g. data_scientist" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Display name</label>
            <input value={draft.display_name} onChange={e => setDraft(d => ({ ...d, display_name: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="e.g. Data Scientist" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Keywords (comma-separated)</label>
          <input value={draft.keywords.join(", ")}
            onChange={e => setDraft(d => ({ ...d, keywords: e.target.value.split(",").map(k => k.trim()).filter(Boolean) }))}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            placeholder="data scientist, data analyst, ml engineer" />
        </div>
        {PROMPT_FIELDS.map(f => (
          <div key={f.key}>
            <label className="block text-xs font-semibold text-slate-500 mb-1">{f.label}</label>
            <textarea rows={3} value={String(draft[f.key] ?? "")} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-300 resize-y" />
          </div>
        ))}
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex gap-2">
          <button onClick={handleCreate} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition">
            <FiPlus className="w-3.5 h-3.5" /> {saving ? "Creating…" : "Create profession"}
          </button>
          <button onClick={() => { setOpen(false); setErr(""); setDraft({ ...EMPTY_PROFESSION }); }}
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfessionsTab({
  professions, loading, fetchedAt, onRefresh,
}: {
  professions: AdminProfession[];
  loading: boolean;
  fetchedAt: Date | null;
  onRefresh: () => void;
}) {
  const active = professions.filter(p => p.is_active);
  const inactive = professions.filter(p => !p.is_active);

  return (
    <div>
      <TabHeader count={professions.length} label="professions" fetchedAt={fetchedAt} loading={loading} onRefresh={onRefresh} />
      {loading && !professions.length ? <Spinner text="Loading professions…" /> : (
        <>
          <p className="text-sm text-slate-500 mb-5">
            Click a profession to expand and edit its prompts and keywords. Changes take effect on the next resume generation.
          </p>
          {active.map(p => <ProfessionCard key={p.slug} profession={p} onSaved={onRefresh} onDeleted={onRefresh} />)}
          {inactive.length > 0 && (
            <p className="text-xs text-slate-400 mt-4 mb-2 font-semibold uppercase tracking-wide">Inactive</p>
          )}
          {inactive.map(p => <ProfessionCard key={p.slug} profession={p} onSaved={onRefresh} onDeleted={onRefresh} />)}
          <NewProfessionForm onCreated={onRefresh} />
        </>
      )}
    </div>
  );
}

export default ProfessionsTab;
