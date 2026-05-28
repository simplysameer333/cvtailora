"use client";
import { useEffect, useState } from "react";
import {
  listProfessions,
  createProfession,
  updateProfession,
  deleteProfession,
  type Profession,
} from "@/lib/api";

const AVAILABLE_EVALUATORS = ["anthropic", "openai", "google"];

const EMPTY_FORM: Omit<Profession, "is_active" | "created_at" | "updated_at"> = {
  slug: "",
  display_name: "",
  keywords: [],
  generator_context: "",
  evaluator_context: "",
  scoring_criteria: "",
  aggregator_context: "",
  evaluator_names: [],
};

export default function ProfessionsPage() {
  const [professions, setProfessions] = useState<Profession[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [form, setForm]               = useState({ ...EMPTY_FORM });
  const [keywordsInput, setKeywordsInput] = useState("");
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");

  async function load() {
    setLoading(true);
    try { setProfessions(await listProfessions()); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setForm({ ...EMPTY_FORM });
    setKeywordsInput("");
    setEditingSlug(null);
    setError("");
    setShowForm(true);
  }

  function openEdit(p: Profession) {
    setForm({
      slug: p.slug,
      display_name: p.display_name,
      keywords: p.keywords,
      generator_context: p.generator_context,
      evaluator_context: p.evaluator_context,
      scoring_criteria: p.scoring_criteria,
      aggregator_context: p.aggregator_context,
      evaluator_names: p.evaluator_names,
    });
    setKeywordsInput(p.keywords.join(", "));
    setEditingSlug(p.slug);
    setError("");
    setShowForm(true);
  }

  function toggleEvaluator(name: string) {
    setForm((f) => ({
      ...f,
      evaluator_names: f.evaluator_names.includes(name)
        ? f.evaluator_names.filter((e) => e !== name)
        : [...f.evaluator_names, name],
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        keywords: keywordsInput.split(",").map((k) => k.trim()).filter(Boolean),
      };
      if (editingSlug) {
        await updateProfession(editingSlug, payload);
      } else {
        await createProfession(payload);
      }
      setShowForm(false);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(slug: string) {
    if (!confirm(`Delete profession "${slug}"?`)) return;
    await deleteProfession(slug);
    await load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Profession Profiles</h1>
          <p className="text-sm text-slate-500 mt-1">
            Each profile defines profession-specific prompts for the generator, evaluators, and
            aggregator. The pipeline auto-selects the matching profile from the candidate&apos;s
            target role.
          </p>
        </div>
        <button
          onClick={openNew}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition"
        >
          + Add Profession
        </button>
      </div>

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : professions.length === 0 ? (
        <p className="text-slate-400">No professions seeded yet. Run <code>python seed_professions.py</code> or add one above.</p>
      ) : (
        <div className="space-y-4">
          {professions.map((p) => (
            <div key={p.slug} className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-base font-semibold text-slate-900">{p.display_name}</h2>
                    <code className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{p.slug}</code>
                    {p.evaluator_names.length > 0 && (
                      <span className="text-xs text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded">
                        Evaluators: {p.evaluator_names.join(", ")}
                      </span>
                    )}
                    {p.evaluator_names.length === 0 && (
                      <span className="text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded">
                        All evaluators
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Keywords: {p.keywords.slice(0, 8).join(", ")}{p.keywords.length > 8 ? "…" : ""}
                  </p>
                  {p.generator_context && (
                    <p className="text-xs text-slate-600 mt-2 line-clamp-2">{p.generator_context.split("\n")[0]}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => openEdit(p)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(p.slug)}
                    className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingSlug ? "Edit Profession" : "Add Profession"}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
            </div>
            <div className="p-6 space-y-5">
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

              <div className="grid grid-cols-2 gap-4">
                <Field label="Slug" hint="lowercase_underscored, unique">
                  <input
                    className="input"
                    value={form.slug}
                    disabled={!!editingSlug}
                    onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                    placeholder="software_engineer"
                  />
                </Field>
                <Field label="Display Name">
                  <input
                    className="input"
                    value={form.display_name}
                    onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                    placeholder="Software Engineer"
                  />
                </Field>
              </div>

              <Field label="Keywords" hint="Comma-separated; matched against candidate's target role">
                <input
                  className="input"
                  value={keywordsInput}
                  onChange={(e) => setKeywordsInput(e.target.value)}
                  placeholder="software, developer, engineer, backend, frontend"
                />
              </Field>

              <Field label="Evaluators" hint="Leave all unchecked to use every configured evaluator">
                <div className="flex gap-3 mt-1">
                  {AVAILABLE_EVALUATORS.map((name) => (
                    <label key={name} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.evaluator_names.includes(name)}
                        onChange={() => toggleEvaluator(name)}
                        className="rounded accent-brand-600"
                      />
                      {name}
                    </label>
                  ))}
                </div>
              </Field>

              <Field label="Generator Context" hint="Appended to the generator system prompt for this profession">
                <textarea
                  className="input h-28"
                  value={form.generator_context}
                  onChange={(e) => setForm((f) => ({ ...f, generator_context: e.target.value }))}
                  placeholder="PROFESSION-SPECIFIC GUIDANCE — ..."
                />
              </Field>

              <Field label="Evaluator Context" hint="Appended to every evaluator's system prompt">
                <textarea
                  className="input h-24"
                  value={form.evaluator_context}
                  onChange={(e) => setForm((f) => ({ ...f, evaluator_context: e.target.value }))}
                  placeholder="PROFESSION-SPECIFIC EVALUATION — ..."
                />
              </Field>

              <Field label="Scoring Criteria" hint="Replaces the generic 0–100 scoring breakdown">
                <textarea
                  className="input h-24"
                  value={form.scoring_criteria}
                  onChange={(e) => setForm((f) => ({ ...f, scoring_criteria: e.target.value }))}
                  placeholder="Scoring criteria (0–100):&#10;- Technical specificity (25 pts)..."
                />
              </Field>

              <Field label="Aggregator Context" hint="Prepended to the feedback sent back to the generator">
                <textarea
                  className="input h-20"
                  value={form.aggregator_context}
                  onChange={(e) => setForm((f) => ({ ...f, aggregator_context: e.target.value }))}
                  placeholder="Focus improvement suggestions on:&#10;1. ..."
                />
              </Field>
            </div>
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition"
              >
                {saving ? "Saving…" : editingSlug ? "Save Changes" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
        {hint && <span className="font-normal text-slate-400 ml-1">— {hint}</span>}
      </label>
      {children}
    </div>
  );
}
