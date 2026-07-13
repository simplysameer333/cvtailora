"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  adminListCvTemplates, adminCreateCvTemplate, adminUpdateCvTemplate,
  adminDeleteCvTemplate, adminGenerateCvTemplate, adminRecomputeTemplateScores,
} from "@/lib/api";
import { render as renderTpl, renderCtx, type CvTemplate, type DocxConfig, type PreviewData } from "@/lib/cvTemplates";
import {
  FiZap, FiX, FiSave, FiRefreshCw, FiAlertCircle, FiEye, FiEdit2,
  FiCopy, FiDownload, FiTrash2, FiToggleLeft, FiToggleRight,
} from "react-icons/fi";
import { TabHeader, Spinner } from "./shared";

// ── Resume Templates tab (HTML preview templates — `cv_templates`) ─────────────

// Sample CV used to render template previews in the admin screen.
const SAMPLE_PREVIEW: PreviewData = {
  name: "Alex Morgan", title: "Senior Product Manager",
  email: "alex.morgan@email.com", phone: "+1 (555) 012-3456",
  location: "San Francisco, CA", linkedin: "linkedin.com/in/alexmorgan",
  summary: "Product leader with 8+ years shipping data-driven B2B SaaS. Led cross-functional teams to grow ARR 3× and cut churn by 40% through disciplined discovery and outcome-focused roadmaps.",
  skills: ["Product Strategy", "Roadmapping", "SQL", "A/B Testing", "User Research", "Stakeholder Management", "Figma", "Analytics"],
  experience: [
    { title: "Senior Product Manager", company: "NovaCloud", date: "2021 — Present",
      bullets: ["Drove a platform redesign that lifted activation 28% and added $4.2M ARR.", "Built the experimentation program (A/B) now used by 6 squads.", "Defined the north-star metric framework adopted company-wide."] },
    { title: "Product Manager", company: "BrightData", date: "2018 — 2021",
      bullets: ["Launched self-serve onboarding, cutting time-to-value from 14 to 3 days.", "Partnered with sales to close 3 enterprise logos worth $1.8M."] },
    { title: "Associate PM", company: "Loop", date: "2016 — 2018",
      bullets: ["Shipped mobile notifications increasing DAU retention by 12%."] },
  ],
  education: [
    { degree: "B.S. Computer Science", school: "UC Berkeley", year: "2016" },
  ],
  extra_sections: [
    { title: "Certifications", items: ["Pragmatic Institute PMC-III", "AWS Cloud Practitioner"] },
    { title: "Key Achievements", items: ["Grew ARR 3× in 2 years", "Reduced churn 40%"] },
  ],
};

const CV_CATEGORIES = ["Classic", "Modern", "Creative", "Executive", "ATS"] as const;
const CV_TIERS = ["free", "plus"] as const;
const DOCX_LAYOUTS = ["single", "sidebar", "two-equal", "left-bar"];
const DOCX_HEADERS = ["centered", "banner", "serif-centered", "left"];
const DOCX_HEADINGS = ["rule", "colored", "left-border", "double-rule", "gold-rule", "circle-marker"];
const DOCX_FONTS = ["Calibri", "Times New Roman", "Georgia", "Courier New"];

function renderPreviewDoc(html: string, accentColor: string): string {
  try { return renderTpl(html, renderCtx(SAMPLE_PREVIEW, accentColor)); }
  catch { return "<html><body style='font-family:sans-serif;padding:20px;color:#b91c1c'>Preview error — check the template HTML.</body></html>"; }
}

// Scaled iframe preview (matches the A4 thumbnail approach used elsewhere).
function CvPreviewFrame({ html, accentColor, scale = 0.34, heightFactor = 0.72, title }: {
  html: string; accentColor: string; scale?: number; heightFactor?: number; title?: string;
}) {
  const A4_W = 794;
  const srcDoc = useMemo(() => renderPreviewDoc(html, accentColor), [html, accentColor]);
  const frameH = Math.round(A4_W * 1.414 * scale * heightFactor);
  return (
    <div style={{ height: frameH, width: Math.round(A4_W * scale), overflow: "hidden", position: "relative", background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", flexShrink: 0 }}>
      <iframe srcDoc={srcDoc} sandbox="allow-same-origin allow-scripts" scrolling="no" title={title || "preview"}
        style={{ position: "absolute", top: 0, left: 0, width: A4_W, height: Math.round(A4_W * 1.414),
          border: "none", transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }} />
    </div>
  );
}

function copyHtml(tmpl: { html: string; accentColor: string }, flash: (s: string) => void) {
  const doc = renderPreviewDoc(tmpl.html, tmpl.accentColor);
  navigator.clipboard.writeText(doc).then(() => flash("Copied HTML"), () => flash("Copy failed"));
}

function downloadHtml(tmpl: { html: string; accentColor: string; key: string }) {
  const doc = renderPreviewDoc(tmpl.html, tmpl.accentColor);
  const url = URL.createObjectURL(new Blob([doc], { type: "text/html" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${tmpl.key}.html`; a.click();
  URL.revokeObjectURL(url);
}

// Shared editor body for metadata + DOCX knobs + HTML (used by edit & generate-save).
function TemplateFields({ draft, setDraft }: {
  draft: Partial<CvTemplate>; setDraft: (fn: (d: Partial<CvTemplate>) => Partial<CvTemplate>) => void;
}) {
  const cfg: DocxConfig = (draft.docx_config ?? {} as DocxConfig);
  const setCfg = (k: keyof DocxConfig, v: string | number | boolean) =>
    setDraft(d => ({ ...d, docx_config: { ...(d.docx_config ?? {} as DocxConfig), [k]: v } }));
  const inputCls = "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300";
  const lblCls = "block text-[11px] font-semibold text-slate-500 mb-1";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div><label className={lblCls}>Name</label>
          <input className={inputCls} value={draft.name ?? ""} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} /></div>
        <div><label className={lblCls}>Accent colour</label>
          <input type="color" className="w-full h-9 rounded-lg border border-slate-200" value={draft.accentColor ?? "#1d4ed8"} onChange={e => setDraft(d => ({ ...d, accentColor: e.target.value }))} /></div>
        <div><label className={lblCls}>Category</label>
          <select className={inputCls} value={draft.category ?? "Modern"} onChange={e => setDraft(d => ({ ...d, category: e.target.value as CvTemplate["category"] }))}>
            {CV_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
        <div><label className={lblCls}>Tier</label>
          <select className={inputCls} value={draft.tier ?? "plus"} onChange={e => setDraft(d => ({ ...d, tier: e.target.value as CvTemplate["tier"] }))}>
            {CV_TIERS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
        <div><label className={lblCls}>Pages</label>
          <select className={inputCls} value={draft.pages ?? 2} onChange={e => setDraft(d => ({ ...d, pages: Number(e.target.value) as 1 | 2 }))}>
            <option value={1}>1</option><option value={2}>2</option></select></div>
        <div><label className={lblCls}>Best for</label>
          <input className={inputCls} value={draft.bestFor ?? ""} onChange={e => setDraft(d => ({ ...d, bestFor: e.target.value }))} /></div>
      </div>
      <div><label className={lblCls}>Description</label>
        <input className={inputCls} value={draft.description ?? ""} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} /></div>
      <div><label className={lblCls}>Traits (comma-separated)</label>
        <input className={inputCls} value={(draft.traits ?? []).join(", ")} onChange={e => setDraft(d => ({ ...d, traits: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }))} /></div>

      <div className="pt-2 border-t border-slate-100">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">DOCX download layout</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div><label className={lblCls}>Layout</label>
            <select className={inputCls} value={cfg.layout ?? "single"} onChange={e => setCfg("layout", e.target.value)}>
              {DOCX_LAYOUTS.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
          <div><label className={lblCls}>Header</label>
            <select className={inputCls} value={cfg.header ?? "centered"} onChange={e => setCfg("header", e.target.value)}>
              {DOCX_HEADERS.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
          <div><label className={lblCls}>Heading</label>
            <select className={inputCls} value={cfg.heading ?? "rule"} onChange={e => setCfg("heading", e.target.value)}>
              {DOCX_HEADINGS.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
          <div><label className={lblCls}>Font</label>
            <select className={inputCls} value={cfg.font ?? "Calibri"} onChange={e => setCfg("font", e.target.value)}>
              {DOCX_FONTS.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
          <div><label className={lblCls}>Accent (hex)</label>
            <input className={inputCls} value={cfg.accent ?? ""} onChange={e => setCfg("accent", e.target.value)} placeholder="1d4ed8" /></div>
          <div><label className={lblCls}>Sidebar colour</label>
            <input className={inputCls} value={cfg.sidebar_color ?? ""} onChange={e => setCfg("sidebar_color", e.target.value)} placeholder="(hex)" /></div>
          <div><label className={lblCls}>Sidebar ratio</label>
            <input className={inputCls} type="number" step="0.05" min="0" max="0.6" value={cfg.sidebar_ratio ?? 0} onChange={e => setCfg("sidebar_ratio", Number(e.target.value))} /></div>
          <label className="flex items-center gap-2 mt-5 text-sm text-slate-600">
            <input type="checkbox" checked={!!cfg.compact} onChange={e => setCfg("compact", e.target.checked)} className="accent-brand-600" /> Compact</label>
        </div>
      </div>

      <div className="pt-2 border-t border-slate-100">
        <label className={lblCls}>Template HTML (standalone, Mustache placeholders) — live preview on the right</label>
        <div className="flex gap-3">
          <textarea rows={14} value={draft.html ?? ""} onChange={e => setDraft(d => ({ ...d, html: e.target.value }))}
            className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-300 resize-y" />
          <CvPreviewFrame html={draft.html ?? ""} accentColor={draft.accentColor ?? "#1d4ed8"} scale={0.4} heightFactor={1.0} />
        </div>
      </div>
    </div>
  );
}

function CvTemplateCard({ tmpl, onChanged }: { tmpl: CvTemplate; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<CvTemplate>>(tmpl);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { setDraft(tmpl); }, [tmpl]);
  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(""), 2500); }

  async function patch(body: Partial<CvTemplate>, ok = "Saved") {
    setBusy(true);
    try { await adminUpdateCvTemplate(tmpl.key, body); flash(ok); onChanged(); }
    catch (e: unknown) { flash((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Failed"); }
    finally { setBusy(false); }
  }
  async function saveEdit() {
    setBusy(true);
    try {
      await adminUpdateCvTemplate(tmpl.key, {
        name: draft.name, category: draft.category, tier: draft.tier, pages: draft.pages,
        bestFor: draft.bestFor, description: draft.description, traits: draft.traits,
        accentColor: draft.accentColor, html: draft.html, docx_config: draft.docx_config,
      });
      flash("Saved"); setEditing(false); onChanged();
    } catch (e: unknown) { flash((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Save failed"); }
    finally { setBusy(false); }
  }
  async function del() {
    if (!confirm(`Delete template "${tmpl.name}"? This cannot be undone.`)) return;
    setBusy(true);
    try { await adminDeleteCvTemplate(tmpl.key); onChanged(); }
    catch (e: unknown) { flash((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Delete failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className={`card ${!tmpl.is_active ? "opacity-60" : ""}`}>
      <div className="flex gap-4">
        <CvPreviewFrame html={tmpl.html} accentColor={tmpl.accentColor} title={tmpl.name} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-slate-800">{tmpl.name}</span>
            <span className="text-[10px] font-mono text-slate-400">{tmpl.key}</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">{tmpl.category}</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">{tmpl.pages}-page</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-700">{tmpl.tier}</span>
            {typeof tmpl.quality_score === "number" && (
              <span
                title="CV-Score of a gold résumé rendered in this template (its quality ceiling) — drives the tier"
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  tmpl.quality_score >= 85 ? "bg-emerald-100 text-emerald-700"
                    : tmpl.quality_score >= 78 ? "bg-amber-100 text-amber-700"
                    : "bg-rose-100 text-rose-700"
                }`}
              >
                Score {tmpl.quality_score}
              </span>
            )}
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{tmpl.source}</span>
            {!tmpl.is_active && <span className="text-[10px] bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">Inactive</span>}
          </div>
          <p className="text-xs text-slate-500 line-clamp-2 mb-2">{tmpl.description}</p>

          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={tmpl.show_in_cv_score} disabled={busy}
                onChange={e => patch({ show_in_cv_score: e.target.checked }, e.target.checked ? "Shown in CV Score" : "Hidden from CV Score")}
                className="accent-brand-600" />
              Show in CV Score
            </label>
            <button onClick={() => patch({ is_active: !tmpl.is_active }, tmpl.is_active ? "Deactivated" : "Activated")} disabled={busy}
              title={tmpl.is_active ? "Deactivate (hide from users)" : "Activate"} className="text-slate-400 hover:text-slate-600 disabled:opacity-40">
              {tmpl.is_active ? <FiToggleRight className="w-5 h-5 text-teal-600" /> : <FiToggleLeft className="w-5 h-5" />}
            </button>
            <button onClick={() => setEditing(v => !v)} title="Edit" className="text-slate-400 hover:text-brand-600"><FiEdit2 className="w-4 h-4" /></button>
            <button onClick={() => copyHtml(tmpl, flash)} title="Copy rendered HTML" className="text-slate-400 hover:text-brand-600"><FiCopy className="w-4 h-4" /></button>
            <button onClick={() => downloadHtml(tmpl)} title="Download .html" className="text-slate-400 hover:text-teal-600"><FiDownload className="w-4 h-4" /></button>
            {tmpl.source !== "builtin" && (
              <button onClick={del} disabled={busy} title="Delete" className="text-slate-400 hover:text-red-500 disabled:opacity-40"><FiTrash2 className="w-4 h-4" /></button>
            )}
            {msg && <span className={`text-xs font-medium ${msg.includes("fail") || msg.includes("Failed") ? "text-red-600" : "text-green-600"}`}>{msg}</span>}
          </div>
        </div>
      </div>

      {editing && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <TemplateFields draft={draft} setDraft={setDraft} />
          <div className="flex gap-2 mt-3">
            <button onClick={saveEdit} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
              <FiSave className="w-3.5 h-3.5" /> {busy ? "Saving…" : "Save changes"}</button>
            <button onClick={() => { setEditing(false); setDraft(tmpl); }} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function GenerateTemplatePanel({ templates, onCreated }: { templates: CvTemplate[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [baseKey, setBaseKey] = useState("");
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState<Partial<CvTemplate> | null>(null);
  const [saving, setSaving] = useState(false);

  async function generate() {
    if (!prompt.trim()) { setErr("Describe the template you want."); return; }
    setGenerating(true); setErr("");
    try {
      const res = await adminGenerateCvTemplate(prompt, baseKey || undefined);
      const m = res.suggested_metadata || {};
      setDraft({
        name: m.name || "New Template", category: m.category || "Modern", tier: "plus",
        pages: (m.pages as 1 | 2) || 2, bestFor: m.bestFor || "", description: m.description || "",
        traits: m.traits || [], accentColor: m.accentColor || "#1d4ed8",
        html: res.html, docx_config: res.docx_config, show_in_cv_score: false,
      });
    } catch (e: unknown) { setErr((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Generation failed"); }
    finally { setGenerating(false); }
  }
  async function save() {
    if (!draft) return;
    setSaving(true); setErr("");
    try {
      await adminCreateCvTemplate({ ...draft, name: draft.name || "New Template", html: draft.html || "" });
      setOpen(false); setPrompt(""); setBaseKey(""); setDraft(null); onCreated();
    } catch (e: unknown) { setErr((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition">
        <FiZap className="w-4 h-4" /> Generate new template with AI
      </button>
    );
  }

  return (
    <div className="card border-brand-200 bg-brand-50/30">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2"><FiZap className="w-4 h-4 text-brand-600" /> Generate new template</h3>
        <button onClick={() => { setOpen(false); setDraft(null); setErr(""); }} className="text-slate-400 hover:text-slate-600"><FiX className="w-4 h-4" /></button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Describe the design</label>
          <textarea rows={3} value={prompt} onChange={e => setPrompt(e.target.value)}
            placeholder="e.g. A modern two-column template with a dark charcoal sidebar, amber accent headings, and a monospace name."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 resize-y" />
        </div>
        <div className="flex items-end gap-2">
          <div className="w-56">
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Start from (optional)</label>
            <select value={baseKey} onChange={e => setBaseKey(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm">
              <option value="">— blank —</option>
              {templates.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
            </select>
          </div>
          <button onClick={generate} disabled={generating}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 disabled:opacity-50">
            <FiZap className="w-3.5 h-3.5" /> {generating ? "Generating…" : "Generate"}
          </button>
        </div>
        {err && <p className="text-sm text-red-600 flex items-center gap-1.5"><FiAlertCircle className="w-4 h-4" /> {err}</p>}

        {draft && (
          <div className="pt-3 border-t border-brand-100">
            <p className="text-xs text-slate-500 mb-3 flex items-center gap-1.5"><FiEye className="w-3.5 h-3.5" /> Preview &amp; adjust, then save.</p>
            <TemplateFields draft={draft} setDraft={(fn) => setDraft(d => fn(d ?? {}))} />
            <div className="flex gap-2 mt-3">
              <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
                <FiSave className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save template"}</button>
              <button onClick={generate} disabled={generating} className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">
                <FiRefreshCw className="w-3.5 h-3.5" /> Regenerate</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ManageTemplatesTab() {
  const [templates, setTemplates] = useState<CvTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [scoring, setScoring] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setTemplates(await adminListCvTemplates()); setFetchedAt(new Date()); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function recomputeScores() {
    if (!confirm("Score every template against the gold résumé? This runs one CV-Score LLM call per template.")) return;
    setScoring(true);
    try {
      const res = await adminRecomputeTemplateScores();
      toast.success(`Scored ${res.scored}/${res.total} templates.`);
      await load();
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Scoring failed.");
    } finally { setScoring(false); }
  }

  const activeInScore = templates.filter(t => t.show_in_cv_score && t.is_active).length;
  const scoredCount = templates.filter(t => typeof t.quality_score === "number").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <TabHeader count={templates.length} label="resume templates" fetchedAt={fetchedAt} loading={loading} onRefresh={load} />
        <button
          onClick={recomputeScores}
          disabled={scoring}
          title="Render a gold résumé into each template and store its CV-Score + derived tier"
          className="btn-secondary text-sm gap-1.5 shrink-0 disabled:opacity-50"
        >
          <FiZap className="w-4 h-4" />
          {scoring ? "Scoring…" : `Recompute scores${scoredCount ? ` (${scoredCount} scored)` : ""}`}
        </button>
      </div>
      <div className="rounded-xl border border-brand-200 bg-brand-50/50 px-4 py-3.5 text-sm text-slate-700">
        <p className="font-semibold text-slate-900 mb-2">
          These templates power the live preview gallery in CV Score and the resume builder.
        </p>
        <ul className="space-y-1.5 text-[13px] leading-relaxed">
          <li className="flex gap-2">
            <span className="text-brand-500 font-bold">•</span>
            <span>Tick <span className="font-semibold text-slate-900">Show in CV Score</span> to choose which templates appear in the CV-score gallery&nbsp;— <span className="font-semibold text-brand-700">{activeInScore} active</span>.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-500 font-bold">•</span>
            <span>Edit a template&apos;s HTML, or <span className="font-semibold text-slate-900">generate a brand-new one with AI</span>&nbsp;— changes go live instantly, with no deploy.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-500 font-bold">•</span>
            <span>Built-in templates can be deactivated to hide them, but not deleted.</span>
          </li>
        </ul>
      </div>
      <GenerateTemplatePanel templates={templates} onCreated={load} />
      {loading && !templates.length ? <Spinner text="Loading templates…" /> : (
        <div className="space-y-3">
          {templates.map(t => <CvTemplateCard key={t.key} tmpl={t} onChanged={load} />)}
        </div>
      )}
    </div>
  );
}

export default ManageTemplatesTab;
