"use client";
import { useState } from "react";
import { FiDroplet, FiPlus, FiX } from "react-icons/fi";
import { updateSystemConfig, type SystemConfig } from "@/lib/api";

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

/**
 * Admin → System: editor for the global template accent palette.
 * These colours are offered as variants on every CV template that has no
 * per-template `accent_variants` list — all MongoDB data, nothing hardcoded.
 */
export default function AccentPaletteCard({
  cfg,
  onSaved,
}: {
  cfg: SystemConfig;
  onSaved: (cfg: SystemConfig) => void;
}) {
  const [palette, setPalette] = useState<string[]>(cfg.template_accent_palette ?? []);
  const [draft, setDraft] = useState("#");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(""), 2500); }

  async function save(next: string[]) {
    setSaving(true);
    try {
      const updated = await updateSystemConfig({ template_accent_palette: next });
      setPalette(updated.template_accent_palette ?? next);
      onSaved(updated);
      flash("Palette saved");
    } catch {
      flash("Failed");
    } finally {
      setSaving(false);
    }
  }

  function handleAdd() {
    const v = draft.trim();
    if (!HEX_RE.test(v)) { flash("Enter a 6-digit hex colour"); return; }
    const hex = `#${v.replace("#", "").toLowerCase()}`;
    if (palette.some((p) => p.toLowerCase() === hex)) { flash("Already in palette"); return; }
    setDraft("#");
    save([...palette, hex]);
  }

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <div className="mt-0.5 w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
            <FiDroplet className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Template Colour Palette</h3>
            <p className="text-sm text-slate-500 mt-0.5 max-w-xl">
              Accent-colour variants users can pick for any resume template. A template with its own
              <code className="mx-1 text-xs bg-slate-100 rounded px-1">accent_variants</code>
              list overrides this global palette.
            </p>
          </div>
        </div>
        {msg && <span className={`text-xs font-medium shrink-0 ${msg === "Palette saved" ? "text-green-600" : "text-red-600"}`}>{msg}</span>}
      </div>

      <div className="flex items-center gap-2 flex-wrap mt-4">
        {palette.map((hex) => (
          <span key={hex} className="group relative inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white pl-1.5 pr-2 py-1">
            <span className="w-4 h-4 rounded-full border border-slate-200" style={{ backgroundColor: hex }} />
            <span className="text-xs font-mono text-slate-600">{hex}</span>
            <button
              onClick={() => save(palette.filter((p) => p !== hex))}
              disabled={saving}
              className="text-slate-300 hover:text-red-500 transition disabled:opacity-40"
              title={`Remove ${hex}`}
            >
              <FiX className="w-3 h-3" />
            </button>
          </span>
        ))}

        <div className="inline-flex items-center gap-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            placeholder="#1d4ed8"
            className="input text-xs font-mono py-1 px-2 h-7 w-24"
          />
          <button
            onClick={handleAdd}
            disabled={saving}
            className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 transition disabled:opacity-40"
            title="Add colour"
          >
            <FiPlus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
