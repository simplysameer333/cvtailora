"use client";
import { useEffect, useState } from "react";
import { adminUpdatePrompt, adminResetPrompt, type PromptOverride } from "@/lib/api";
import { FiSave, FiRotateCcw } from "react-icons/fi";
import { TabHeader, Spinner } from "./shared";

// ── Prompts tab ────────────────────────────────────────────────────────────────

function PromptCard({ prompt, onSaved }: { prompt: PromptOverride; onSaved: () => void }) {
  const [body, setBody] = useState(prompt.body);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [msg, setMsg] = useState("");

  // Sync body when parent refreshes
  useEffect(() => { setBody(prompt.body); }, [prompt.body]);

  const isDirty = body !== prompt.body;
  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(""), 3000); }

  async function handleSave() {
    setSaving(true);
    try { await adminUpdatePrompt(prompt.key, body); flash("Saved"); onSaved(); }
    catch { flash("Save failed"); }
    finally { setSaving(false); }
  }

  async function handleReset() {
    setResetting(true);
    try {
      const res = await adminResetPrompt(prompt.key);
      setBody(res.default_body);
      flash("Reset to default");
      onSaved();
    } catch { flash("Reset failed"); }
    finally { setResetting(false); }
  }

  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-slate-800">{prompt.label}</h3>
          <p className="text-xs text-slate-400 font-mono mt-0.5">{prompt.key}</p>
        </div>
        <div className="flex items-center gap-2">
          {prompt.is_override && <span className="text-xs bg-amber-100 text-amber-700 rounded px-2 py-0.5 font-semibold">Override active</span>}
          {msg && <span className={`text-xs font-medium ${msg.includes("fail") ? "text-red-600" : "text-green-600"}`}>{msg}</span>}
        </div>
      </div>
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={12}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-300 resize-y"
      />
      <div className="flex gap-2 mt-3">
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition"
        >
          <FiSave className="w-3.5 h-3.5" />
          {saving ? "Saving…" : "Save override"}
        </button>
        {prompt.is_override && (
          <button
            onClick={handleReset}
            disabled={resetting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 transition"
          >
            <FiRotateCcw className="w-3.5 h-3.5" />
            {resetting ? "Resetting…" : "Reset to default"}
          </button>
        )}
      </div>
    </div>
  );
}

function PromptsTab({
  prompts, loading, fetchedAt, onRefresh, headerLabel = "Edit prompts below",
}: {
  prompts: PromptOverride[];
  loading: boolean;
  fetchedAt: Date | null;
  onRefresh: () => void;
  headerLabel?: string;
}) {
  return (
    <div>
      <TabHeader label={headerLabel} fetchedAt={fetchedAt} loading={loading} onRefresh={onRefresh} />
      {loading && !prompts.length ? <Spinner text="Loading prompts…" /> : (
        <>
          <p className="text-sm text-slate-500 mb-5">
            Save an override to replace the hardcoded default. The pipeline uses it immediately. Reset reverts to the original.
          </p>
          {prompts.map(p => <PromptCard key={p.key} prompt={p} onSaved={onRefresh} />)}
        </>
      )}
    </div>
  );
}

export default PromptsTab;
