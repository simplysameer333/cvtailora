"use client";
// Legacy React template components (pre-MongoDB-templates era). At runtime all
// previews render via getTemplateHtml/iframes; these remain only to satisfy the
// TemplateInfo.component field and as the built-in fallback. Split out of
// TemplatePreviews.tsx (2026-07-13, no-very-large-files).
import React from "react";
import type { PreviewData } from "@/lib/cvTemplates";

const W = 600; // base template width in px (used by React components)

// A4 iframe dimensions — used by all iframe-based previews
const A4_W     = 794;
const A4_RATIO = 1.414;
const a4H = (scale: number) => Math.round(A4_W * A4_RATIO * scale);
const a4W = (scale: number) => Math.round(A4_W * scale);

// ── Scaling wrapper ───────────────────────────────────────────────────────────

function Scaled({ children, scale }: { children: React.ReactNode; scale: number }) {
  const w = Math.round(W * scale);
  const h = Math.round(W * 1.414 * scale); // A4 ratio
  return (
    <div style={{ width: w, height: h, overflow: "hidden", position: "relative", flexShrink: 0 }}>
      <div style={{ width: W, position: "absolute", top: 0, left: 0,
        transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {children}
      </div>
    </div>
  );
}

// ── Shared section heading styles ─────────────────────────────────────────────

const contact = (d: PreviewData) =>
  [d.email, d.phone, d.location, d.linkedin].filter(Boolean).join("  ·  ");

// ══════════════════════════════════════════════════════════════════════════════
// 15 TEMPLATE COMPONENTS
// Each renders at W=600px width, no height constraint (scales with content)
// ══════════════════════════════════════════════════════════════════════════════

// 1. CAMBRIDGE — Classic single-column, clean dividers
export function Cambridge({ data }: { data: PreviewData }) {
  const h2 = { fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 1.5, color: "#374151", margin: "18px 0 4px" };
  return (
    <div style={{ width: W, background: "#fff", padding: "48px 52px", fontFamily: "'Calibri',system-ui,sans-serif", color: "#1f2937", lineHeight: 1.5 }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#111827" }}>{data.name}</div>
      <div style={{ fontSize: 13, color: "#4b5563", marginTop: 4 }}>{data.title}</div>
      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{contact(data)}</div>
      <div style={{ borderTop: "1.5px solid #d1d5db", margin: "14px 0" }} />
      <div style={h2}>Professional Summary</div>
      <div style={{ borderTop: "1px solid #d1d5db", marginBottom: 6 }} />
      <div style={{ fontSize: 12, color: "#374151" }}>{data.summary}</div>
      <div style={h2}>Work Experience</div>
      <div style={{ borderTop: "1px solid #d1d5db", marginBottom: 8 }} />
      {data.experience.map((e, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{e.title} — {e.company}</span>
            <span style={{ fontSize: 11, color: "#6b7280" }}>{e.date}</span>
          </div>
          {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, color: "#4b5563", paddingLeft: 14, marginTop: 3 }}>• {b}</div>)}
        </div>
      ))}
      <div style={h2}>Skills</div>
      <div style={{ borderTop: "1px solid #d1d5db", marginBottom: 6 }} />
      <div style={{ fontSize: 12, color: "#374151" }}>{data.skills.join("  ·  ")}</div>
      <div style={h2}>Education</div>
      <div style={{ borderTop: "1px solid #d1d5db", marginBottom: 6 }} />
      {data.education.map((e, i) => (
        <div key={i} style={{ fontSize: 12, color: "#374151" }}>{e.degree}  ·  {e.school}  ·  {e.year}</div>
      ))}
    </div>
  );
}

// 2. HORIZON — Blue header, bold section headings
export function Horizon({ data }: { data: PreviewData }) {
  const blue = "#1d4ed8";
  return (
    <div style={{ width: W, background: "#fff", fontFamily: "system-ui,sans-serif", color: "#1f2937" }}>
      <div style={{ background: blue, padding: "36px 48px 28px" }}>
        <div style={{ fontSize: 30, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>{data.name}</div>
        <div style={{ fontSize: 14, color: "#bfdbfe", marginTop: 4 }}>{data.title}</div>
        <div style={{ fontSize: 11, color: "#93c5fd", marginTop: 6 }}>{contact(data)}</div>
      </div>
      <div style={{ padding: "24px 48px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: blue, textTransform: "uppercase" as const, letterSpacing: 1.5, marginBottom: 4 }}>Profile</div>
        <div style={{ borderTop: `2px solid ${blue}`, marginBottom: 8 }} />
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>{data.summary}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: blue, textTransform: "uppercase" as const, letterSpacing: 1.5, margin: "18px 0 4px" }}>Experience</div>
        <div style={{ borderTop: `2px solid ${blue}`, marginBottom: 8 }} />
        {data.experience.map((e, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{e.title} · {e.company}</span>
              <span style={{ fontSize: 11, color: "#6b7280", fontStyle: "italic" }}>{e.date}</span>
            </div>
            {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, color: "#4b5563", paddingLeft: 12, marginTop: 2 }}>• {b}</div>)}
          </div>
        ))}
        <div style={{ fontSize: 11, fontWeight: 700, color: blue, textTransform: "uppercase" as const, letterSpacing: 1.5, margin: "18px 0 4px" }}>Skills</div>
        <div style={{ borderTop: `2px solid ${blue}`, marginBottom: 8 }} />
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
          {data.skills.map(s => <span key={s} style={{ background: "#eff6ff", color: blue, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 500 }}>{s}</span>)}
        </div>
      </div>
    </div>
  );
}

// 3. PRESTIGE — Formal serif, centered header, double rules
export function Prestige({ data }: { data: PreviewData }) {
  return (
    <div style={{ width: W, background: "#fff", padding: "48px 52px", fontFamily: "Georgia,serif", color: "#1c1c1c" }}>
      <div style={{ borderTop: "2.5px solid #1c1c1c", marginBottom: 10 }} />
      <div style={{ textAlign: "center" as const }}>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" as const }}>{data.name}</div>
        <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>{data.title}</div>
        <div style={{ fontSize: 11, color: "#777", marginTop: 4 }}>{contact(data)}</div>
      </div>
      <div style={{ borderTop: "2.5px solid #1c1c1c", marginTop: 10, marginBottom: 2 }} />
      <div style={{ borderTop: "1px solid #1c1c1c", marginBottom: 16 }} />
      {[
        { label: "Professional Summary", content: <div style={{ fontSize: 12, lineHeight: 1.7, fontStyle: "italic" }}>{data.summary}</div> },
      ].map(({ label, content }) => (
        <div key={label} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase" as const, color: "#111" }}>{label}</div>
          <div style={{ borderTop: "1px solid #bbb", borderBottom: "1px solid #bbb", padding: "6px 0", margin: "4px 0" }}>{content}</div>
        </div>
      ))}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase" as const }}>Professional Experience</div>
      <div style={{ borderTop: "1px solid #bbb", borderBottom: "1px solid #bbb", padding: "8px 0", margin: "4px 0 16px" }}>
        {data.experience.map((e, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{e.title}</span>
              <span style={{ fontSize: 11, fontStyle: "italic", color: "#666" }}>{e.date}</span>
            </div>
            <div style={{ fontSize: 11, color: "#555", marginBottom: 3 }}>{e.company}</div>
            {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, paddingLeft: 14, color: "#444" }}>• {b}</div>)}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase" as const }}>Core Competencies</div>
      <div style={{ borderTop: "1px solid #bbb", borderBottom: "1px solid #bbb", padding: "6px 0", margin: "4px 0", fontSize: 11, lineHeight: 2 }}>
        {data.skills.join("   ·   ")}
      </div>
    </div>
  );
}

// 4. CATALYST — Bold orange accent, strong typography
export function Catalyst({ data }: { data: PreviewData }) {
  const orange = "#ea580c";
  return (
    <div style={{ width: W, background: "#fff", padding: "44px 52px", fontFamily: "system-ui,sans-serif", color: "#111" }}>
      <div style={{ fontSize: 32, fontWeight: 900, color: "#0f172a", lineHeight: 1, letterSpacing: -1 }}>{data.name.toUpperCase()}</div>
      <div style={{ height: 4, width: 56, background: orange, margin: "10px 0" }} />
      <div style={{ fontSize: 13, color: "#475569" }}>{data.title}  ·  {data.location}</div>
      <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{data.email}  ·  {data.phone}</div>
      {[
        { title: "About", content: <div style={{ fontSize: 12, lineHeight: 1.6 }}>{data.summary}</div> },
      ].map(({ title, content }) => (
        <div key={title} style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: orange, textTransform: "uppercase" as const, letterSpacing: 2 }}>{title}</div>
          <div style={{ height: 1, background: "#fed7aa", margin: "4px 0 8px" }} />
          {content}
        </div>
      ))}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: orange, textTransform: "uppercase" as const, letterSpacing: 2 }}>Experience</div>
        <div style={{ height: 1, background: "#fed7aa", margin: "4px 0 8px" }} />
        {data.experience.map((e, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{e.title}</span>
              <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{e.company}  ·  {e.date}</span>
            </div>
            {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, paddingLeft: 12, marginTop: 2, color: "#334155" }}>→ {b}</div>)}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: orange, textTransform: "uppercase" as const, letterSpacing: 2 }}>Skills</div>
        <div style={{ height: 1, background: "#fed7aa", margin: "4px 0 8px" }} />
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
          {data.skills.map(s => <span key={s} style={{ background: "#fff7ed", border: "1px solid #fed7aa", color: orange, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{s}</span>)}
        </div>
      </div>
    </div>
  );
}

// 5. CANVAS — Ultra-minimal, whitespace-first
export function Canvas({ data }: { data: PreviewData }) {
  return (
    <div style={{ width: W, background: "#fff", padding: "56px 60px", fontFamily: "'Helvetica Neue',system-ui,sans-serif", color: "#374151" }}>
      <div style={{ fontSize: 24, fontWeight: 300, color: "#111827", letterSpacing: -0.5 }}>{data.name}</div>
      <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4, fontStyle: "italic" }}>{data.title}</div>
      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 6, letterSpacing: 0.5 }}>{contact(data)}</div>
      <div style={{ marginTop: 28 }}>
        <div style={{ fontSize: 9, color: "#9ca3af", textTransform: "uppercase" as const, letterSpacing: 2.5, marginBottom: 8 }}>About</div>
        <div style={{ fontSize: 12, lineHeight: 1.8, color: "#4b5563" }}>{data.summary}</div>
      </div>
      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 9, color: "#9ca3af", textTransform: "uppercase" as const, letterSpacing: 2.5, marginBottom: 8 }}>Work</div>
        {data.experience.map((e, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#111827" }}>{e.title}</span>
              <span style={{ fontSize: 10, color: "#9ca3af" }}>{e.date}</span>
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{e.company}</div>
            {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, color: "#6b7280", paddingLeft: 12, marginTop: 2 }}>— {b}</div>)}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 9, color: "#9ca3af", textTransform: "uppercase" as const, letterSpacing: 2.5, marginBottom: 8 }}>Skills</div>
        <div style={{ fontSize: 12, color: "#4b5563", lineHeight: 2 }}>{data.skills.join("   ·   ")}</div>
      </div>
    </div>
  );
}

// 6. ADMIRAL — Navy blue, formal two-tone
export function Admiral({ data }: { data: PreviewData }) {
  const navy = "#1e3a5f";
  return (
    <div style={{ width: W, background: "#fff", padding: "44px 52px", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700, color: navy }}>{data.name}</div>
          <div style={{ fontSize: 13, color: "#3b5998", marginTop: 3 }}>{data.title}</div>
        </div>
        <div style={{ textAlign: "right" as const, fontSize: 11, color: "#6b7280", lineHeight: 1.7 }}>
          <div>{data.email}</div><div>{data.phone}</div><div>{data.location}</div>
        </div>
      </div>
      <div style={{ borderTop: `2px solid ${navy}`, margin: "14px 0 8px" }} />
      <div style={{ fontSize: 10, fontWeight: 700, color: navy, textTransform: "uppercase" as const, letterSpacing: 2, marginBottom: 6 }}>Career Profile</div>
      <div style={{ fontSize: 12, lineHeight: 1.6, color: "#374151", marginBottom: 18 }}>{data.summary}</div>
      <div style={{ borderTop: `1px solid ${navy}`, margin: "0 0 6px" }} />
      <div style={{ fontSize: 10, fontWeight: 700, color: navy, textTransform: "uppercase" as const, letterSpacing: 2, marginBottom: 10 }}>Career History</div>
      {data.experience.map((e, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{e.title}</span>
            <span style={{ fontSize: 11, color: "#6b7280" }}>{e.date}</span>
          </div>
          <div style={{ fontSize: 11, color: navy, fontWeight: 600, marginBottom: 3 }}>{e.company}</div>
          {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, paddingLeft: 14, color: "#4b5563", marginTop: 2 }}>• {b}</div>)}
        </div>
      ))}
      <div style={{ borderTop: `1px solid ${navy}`, margin: "12px 0 6px" }} />
      <div style={{ fontSize: 10, fontWeight: 700, color: navy, textTransform: "uppercase" as const, letterSpacing: 2, marginBottom: 6 }}>Core Skills</div>
      <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.9 }}>{data.skills.join("  ·  ")}</div>
    </div>
  );
}

// 7. JADE — Teal left accent bar + teal headings
export function Jade({ data }: { data: PreviewData }) {
  const teal = "#0d9488";
  return (
    <div style={{ width: W, background: "#fff", fontFamily: "system-ui,sans-serif", display: "flex" }}>
      <div style={{ width: 6, background: teal, flexShrink: 0 }} />
      <div style={{ padding: "44px 48px", flex: 1 }}>
        <div style={{ fontSize: 27, fontWeight: 700, color: "#0f172a" }}>{data.name}</div>
        <div style={{ fontSize: 13, color: teal, marginTop: 3 }}>{data.title}</div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{contact(data)}</div>
        <div style={{ height: 1, background: "#ccfbf1", margin: "16px 0" }} />
        <SectionTeal label="Summary" teal={teal}>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>{data.summary}</div>
        </SectionTeal>
        <SectionTeal label="Experience" teal={teal}>
          {data.experience.map((e, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{e.title} — {e.company}</span>
                <span style={{ fontSize: 11, color: "#64748b" }}>{e.date}</span>
              </div>
              {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, paddingLeft: 12, marginTop: 2, color: "#475569" }}>• {b}</div>)}
            </div>
          ))}
        </SectionTeal>
        <SectionTeal label="Skills" teal={teal}>
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
            {data.skills.map(s => <span key={s} style={{ background: "#f0fdfa", border: `1px solid ${teal}`, color: teal, borderRadius: 4, padding: "2px 8px", fontSize: 11 }}>{s}</span>)}
          </div>
        </SectionTeal>
      </div>
    </div>
  );
}
function SectionTeal({ label, teal, children }: { label: string; teal: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: teal, textTransform: "uppercase" as const, letterSpacing: 1.5, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

// 8. PRISM — Two-column: gray sidebar | main
export function Prism({ data }: { data: PreviewData }) {
  return (
    <div style={{ width: W, background: "#fff", fontFamily: "system-ui,sans-serif", display: "flex", minHeight: 848 }}>
      <div style={{ width: 200, background: "#f1f5f9", padding: "40px 22px", flexShrink: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", lineHeight: 1.2 }}>{data.name}</div>
        <div style={{ fontSize: 11, color: "#2563eb", marginTop: 4 }}>{data.title}</div>
        <div style={{ height: 2, width: 32, background: "#2563eb", margin: "10px 0" }} />
        <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.9 }}>
          <div>{data.email}</div><div>{data.phone}</div><div>{data.location}</div><div>{data.linkedin}</div>
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#1e293b", textTransform: "uppercase" as const, letterSpacing: 1.5, margin: "20px 0 8px" }}>Skills</div>
        <div style={{ height: 1, background: "#cbd5e1", marginBottom: 8 }} />
        {data.skills.map(s => (
          <div key={s} style={{ fontSize: 11, color: "#334155", marginBottom: 4 }}>
            <span style={{ color: "#2563eb", marginRight: 6 }}>▸</span>{s}
          </div>
        ))}
        <div style={{ fontSize: 10, fontWeight: 700, color: "#1e293b", textTransform: "uppercase" as const, letterSpacing: 1.5, margin: "20px 0 8px" }}>Education</div>
        <div style={{ height: 1, background: "#cbd5e1", marginBottom: 8 }} />
        {data.education.map((e, i) => (
          <div key={i} style={{ fontSize: 11, color: "#334155", lineHeight: 1.6 }}>
            <div style={{ fontWeight: 600 }}>{e.degree}</div>
            <div style={{ color: "#64748b" }}>{e.school}</div>
            <div style={{ color: "#94a3b8" }}>{e.year}</div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, padding: "40px 32px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", textTransform: "uppercase" as const, letterSpacing: 1.5, marginBottom: 6 }}>Profile</div>
        <div style={{ height: 1, background: "#e2e8f0", marginBottom: 10 }} />
        <div style={{ fontSize: 12, lineHeight: 1.6, color: "#374151", marginBottom: 20 }}>{data.summary}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", textTransform: "uppercase" as const, letterSpacing: 1.5, marginBottom: 6 }}>Experience</div>
        <div style={{ height: 1, background: "#e2e8f0", marginBottom: 10 }} />
        {data.experience.map((e, i) => (
          <div key={i} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{e.title}</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "#2563eb" }}>{e.company}</span>
              <span style={{ fontSize: 10, color: "#94a3b8" }}>{e.date}</span>
            </div>
            {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, paddingLeft: 12, color: "#475569", marginTop: 2 }}>• {b}</div>)}
          </div>
        ))}
      </div>
    </div>
  );
}

// 9. VIVID — Purple sidebar, creative
export function Vivid({ data }: { data: PreviewData }) {
  const purple = "#7c3aed";
  return (
    <div style={{ width: W, background: "#fff", fontFamily: "system-ui,sans-serif", display: "flex", minHeight: 848 }}>
      <div style={{ width: 190, background: purple, padding: "40px 20px", flexShrink: 0 }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>{data.name.charAt(0)}</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>{data.name}</div>
        <div style={{ fontSize: 11, color: "#c4b5fd", marginTop: 4 }}>{data.title}</div>
        <div style={{ height: 1, background: "rgba(255,255,255,0.2)", margin: "14px 0" }} />
        <div style={{ fontSize: 10, color: "#ddd6fe", lineHeight: 2 }}>
          <div>{data.email}</div><div>{data.phone}</div><div>{data.location}</div>
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#fff", textTransform: "uppercase" as const, letterSpacing: 1.5, margin: "18px 0 8px" }}>Skills</div>
        {data.skills.map(s => <div key={s} style={{ fontSize: 11, color: "#ede9fe", marginBottom: 4 }}>▸ {s}</div>)}
        <div style={{ fontSize: 10, fontWeight: 700, color: "#fff", textTransform: "uppercase" as const, letterSpacing: 1.5, margin: "18px 0 8px" }}>Education</div>
        {data.education.map((e, i) => (
          <div key={i} style={{ fontSize: 10, color: "#ddd6fe", lineHeight: 1.7 }}>
            <div style={{ fontWeight: 600, color: "#fff" }}>{e.degree}</div>
            <div>{e.school} · {e.year}</div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, padding: "40px 30px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: purple, textTransform: "uppercase" as const, letterSpacing: 1.5, marginBottom: 6 }}>Profile</div>
        <div style={{ height: 1.5, background: "#ede9fe", marginBottom: 10 }} />
        <div style={{ fontSize: 12, lineHeight: 1.6, color: "#374151", marginBottom: 20 }}>{data.summary}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: purple, textTransform: "uppercase" as const, letterSpacing: 1.5, marginBottom: 6 }}>Experience</div>
        <div style={{ height: 1.5, background: "#ede9fe", marginBottom: 10 }} />
        {data.experience.map((e, i) => (
          <div key={i} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{e.title}</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: purple }}>{e.company}</span>
              <span style={{ fontSize: 10, color: "#94a3b8" }}>{e.date}</span>
            </div>
            {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, paddingLeft: 12, color: "#475569", marginTop: 2 }}>• {b}</div>)}
          </div>
        ))}
      </div>
    </div>
  );
}

// 10. CHRONICLE — Timeline with left border dots
export function Chronicle({ data }: { data: PreviewData }) {
  const brand = "#2563eb";
  return (
    <div style={{ width: W, background: "#fff", padding: "44px 52px", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ fontSize: 27, fontWeight: 700, color: "#0f172a" }}>{data.name}</div>
      <div style={{ fontSize: 13, color: brand, marginTop: 3 }}>{data.title}</div>
      <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{contact(data)}</div>
      <div style={{ height: 1, background: "#e2e8f0", margin: "14px 0" }} />
      <div style={{ fontSize: 12, lineHeight: 1.6, color: "#374151", marginBottom: 18 }}>{data.summary}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", textTransform: "uppercase" as const, letterSpacing: 1.5, marginBottom: 12 }}>Experience</div>
      {data.experience.map((e, i) => (
        <div key={i} style={{ display: "flex", gap: 14, marginBottom: 16 }}>
          <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", width: 12, flexShrink: 0 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: brand, border: "2px solid #fff", boxShadow: `0 0 0 2px ${brand}`, flexShrink: 0 }} />
            {i < data.experience.length - 1 && <div style={{ flex: 1, width: 1.5, background: "#cbd5e1", marginTop: 4 }} />}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{e.title}</span>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>{e.date}</span>
            </div>
            <div style={{ fontSize: 11, color: brand, marginBottom: 4 }}>{e.company}</div>
            {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, paddingLeft: 10, color: "#475569", marginTop: 2 }}>• {b}</div>)}
          </div>
        </div>
      ))}
      <div style={{ height: 1, background: "#e2e8f0", margin: "4px 0 10px" }} />
      <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", textTransform: "uppercase" as const, letterSpacing: 1.5, marginBottom: 8 }}>Skills</div>
      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
        {data.skills.map(s => <span key={s} style={{ background: "#eff6ff", color: brand, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 500 }}>{s}</span>)}
      </div>
    </div>
  );
}

// 11. SUMMIT — Dark charcoal header block
export function Summit({ data }: { data: PreviewData }) {
  const dark = "#1e293b";
  return (
    <div style={{ width: W, background: "#fff", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ background: dark, padding: "36px 48px 28px" }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>{data.name}</div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>{data.title}</div>
        <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" as const }}>
          {[data.email, data.phone, data.location].map(v => (
            <span key={v} style={{ fontSize: 10, color: "#64748b", background: "rgba(255,255,255,0.07)", padding: "2px 8px", borderRadius: 3 }}>{v}</span>
          ))}
        </div>
      </div>
      <div style={{ padding: "24px 48px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: dark, textTransform: "uppercase" as const, letterSpacing: 2, marginBottom: 6 }}>Summary</div>
        <div style={{ height: 1, background: "#e2e8f0", marginBottom: 10 }} />
        <div style={{ fontSize: 12, lineHeight: 1.6, color: "#374151", marginBottom: 20 }}>{data.summary}</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: dark, textTransform: "uppercase" as const, letterSpacing: 2, marginBottom: 6 }}>Experience</div>
        <div style={{ height: 1, background: "#e2e8f0", marginBottom: 10 }} />
        {data.experience.map((e, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{e.title} — {e.company}</span>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>{e.date}</span>
            </div>
            {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, paddingLeft: 12, color: "#475569", marginTop: 2 }}>• {b}</div>)}
          </div>
        ))}
        <div style={{ fontSize: 10, fontWeight: 700, color: dark, textTransform: "uppercase" as const, letterSpacing: 2, margin: "16px 0 8px" }}>Skills</div>
        <div style={{ height: 1, background: "#e2e8f0", marginBottom: 10 }} />
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
          {data.skills.map(s => <span key={s} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", color: dark, borderRadius: 4, padding: "2px 8px", fontSize: 11 }}>{s}</span>)}
        </div>
      </div>
    </div>
  );
}

// 12. SYMMETRY — Equal two columns
export function Symmetry({ data }: { data: PreviewData }) {
  return (
    <div style={{ width: W, background: "#fff", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ padding: "36px 48px 16px", borderBottom: "2px solid #0f172a" }}>
        <div style={{ textAlign: "center" as const }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#0f172a" }}>{data.name}</div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>{data.title}  ·  {contact(data)}</div>
        </div>
      </div>
      <div style={{ display: "flex", padding: "20px 32px", gap: 24 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#0f172a", textTransform: "uppercase" as const, letterSpacing: 1.5, marginBottom: 6 }}>Experience</div>
          {data.experience.map((e, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{e.title}</div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: "#2563eb" }}>{e.company}</span>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>{e.date}</span>
              </div>
              {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, paddingLeft: 10, marginTop: 2, color: "#475569" }}>• {b}</div>)}
            </div>
          ))}
          <div style={{ fontSize: 12, lineHeight: 1.6, color: "#374151" }}>{data.summary}</div>
        </div>
        <div style={{ width: 1, background: "#e2e8f0" }} />
        <div style={{ width: 200, flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#0f172a", textTransform: "uppercase" as const, letterSpacing: 1.5, marginBottom: 6 }}>Skills</div>
          {data.skills.map(s => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#2563eb" }} />
              <span style={{ fontSize: 11, color: "#374151" }}>{s}</span>
            </div>
          ))}
          <div style={{ fontSize: 10, fontWeight: 700, color: "#0f172a", textTransform: "uppercase" as const, letterSpacing: 1.5, margin: "16px 0 6px" }}>Education</div>
          {data.education.map((e, i) => (
            <div key={i} style={{ fontSize: 11, color: "#374151", lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600 }}>{e.degree}</div>
              <div style={{ color: "#6b7280" }}>{e.school}</div>
              <div style={{ color: "#9ca3af" }}>{e.year}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 13. SCHOLAR — Academic, formal structure
export function Scholar({ data }: { data: PreviewData }) {
  return (
    <div style={{ width: W, background: "#fff", padding: "48px 56px", fontFamily: "Georgia,serif", color: "#1c1c1c", lineHeight: 1.6 }}>
      <div style={{ textAlign: "center" as const, marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1 }}>{data.name}</div>
        <div style={{ fontSize: 12, color: "#555", marginTop: 3 }}>{data.title}</div>
        <div style={{ fontSize: 11, color: "#777", marginTop: 3 }}>{contact(data)}</div>
      </div>
      <div style={{ borderTop: "2px solid #333", borderBottom: "1px solid #333", padding: "8px 0", marginBottom: 16, textAlign: "center" as const }}>
        <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase" as const, color: "#333" }}>Research & Professional Summary</div>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.8, marginBottom: 20, textAlign: "justify" as const }}>{data.summary}</div>
      <div style={{ borderTop: "1px solid #999", paddingTop: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const }}>Professional Experience</div>
      </div>
      {data.experience.map((e, i) => (
        <div key={i} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{e.title}</span>
            <span style={{ fontSize: 11, fontStyle: "italic", color: "#555" }}>{e.date}</span>
          </div>
          <div style={{ fontSize: 11, fontStyle: "italic", color: "#555", marginBottom: 4 }}>{e.company}</div>
          {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, paddingLeft: 18, color: "#333" }}>• {b}</div>)}
        </div>
      ))}
      <div style={{ borderTop: "1px solid #999", paddingTop: 8, margin: "16px 0 10px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const }}>Education</div>
      </div>
      {data.education.map((e, i) => (
        <div key={i} style={{ fontSize: 12, color: "#1c1c1c" }}>{e.degree}  ·  {e.school}  ·  {e.year}</div>
      ))}
      <div style={{ borderTop: "1px solid #999", paddingTop: 8, margin: "16px 0 10px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const }}>Technical Competencies</div>
      </div>
      <div style={{ fontSize: 12, lineHeight: 2 }}>{data.skills.join("   ·   ")}</div>
    </div>
  );
}

// 14. SWIFT — Ultra-compact, maximises content on one page
export function Swift({ data }: { data: PreviewData }) {
  return (
    <div style={{ width: W, background: "#fff", padding: "32px 44px", fontFamily: "system-ui,sans-serif", fontSize: 11 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1.5px solid #374151", paddingBottom: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>{data.name}</div>
        <div style={{ color: "#64748b", fontSize: 10 }}>{data.email}  ·  {data.phone}  ·  {data.location}</div>
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase" as const, letterSpacing: 1.5, marginBottom: 4 }}>Summary</div>
      <div style={{ color: "#4b5563", marginBottom: 10, lineHeight: 1.5 }}>{data.summary}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase" as const, letterSpacing: 1.5, marginBottom: 4 }}>Experience</div>
      {data.experience.map((e, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600, color: "#1e293b" }}>{e.title}  —  {e.company}</span>
            <span style={{ color: "#94a3b8", fontSize: 10 }}>{e.date}</span>
          </div>
          {e.bullets.map((b, j) => <div key={j} style={{ paddingLeft: 12, color: "#475569", marginTop: 1 }}>• {b}</div>)}
        </div>
      ))}
      <div style={{ fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase" as const, letterSpacing: 1.5, margin: "8px 0 4px" }}>Skills</div>
      <div style={{ color: "#4b5563", lineHeight: 1.8 }}>{data.skills.join("  ·  ")}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase" as const, letterSpacing: 1.5, margin: "8px 0 4px" }}>Education</div>
      {data.education.map((e, i) => <div key={i} style={{ color: "#4b5563" }}>{e.degree}  ·  {e.school}  ·  {e.year}</div>)}
    </div>
  );
}

// 15. LUXE — Warm gold accents, cream background
export function Luxe({ data }: { data: PreviewData }) {
  const gold = "#b45309";
  return (
    <div style={{ width: W, background: "#fffdf5", padding: "52px 56px", fontFamily: "Georgia,serif", color: "#292524" }}>
      <div style={{ textAlign: "center" as const, marginBottom: 8 }}>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 2, color: "#1c1917" }}>{data.name.toUpperCase()}</div>
        <div style={{ fontSize: 12, color: gold, letterSpacing: 1.5, marginTop: 4 }}>{data.title}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0" }}>
        <div style={{ flex: 1, height: 1, background: gold, opacity: 0.4 }} />
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: gold }} />
        <div style={{ flex: 1, height: 1, background: gold, opacity: 0.4 }} />
      </div>
      <div style={{ textAlign: "center" as const, fontSize: 10, color: "#78716c", marginBottom: 24 }}>{contact(data)}</div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: gold, textTransform: "uppercase" as const, letterSpacing: 3, marginBottom: 6 }}>Professional Profile</div>
        <div style={{ height: 1, background: gold, opacity: 0.3, marginBottom: 10 }} />
        <div style={{ fontSize: 12, lineHeight: 1.8, color: "#44403c", fontStyle: "italic" }}>{data.summary}</div>
      </div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: gold, textTransform: "uppercase" as const, letterSpacing: 3, marginBottom: 6 }}>Career History</div>
        <div style={{ height: 1, background: gold, opacity: 0.3, marginBottom: 10 }} />
        {data.experience.map((e, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#1c1917" }}>{e.title}  ·  {e.company}</span>
              <span style={{ fontSize: 11, fontStyle: "italic", color: "#78716c" }}>{e.date}</span>
            </div>
            {e.bullets.map((b, j) => <div key={j} style={{ fontSize: 11, paddingLeft: 14, color: "#57534e", marginTop: 3 }}>• {b}</div>)}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: gold, textTransform: "uppercase" as const, letterSpacing: 3, marginBottom: 6 }}>Core Expertise</div>
      <div style={{ height: 1, background: gold, opacity: 0.3, marginBottom: 10 }} />
      <div style={{ fontSize: 12, color: "#44403c", lineHeight: 2 }}>{data.skills.join("   ·   ")}</div>
    </div>
  );
}

// 16-20. New templates — previews rendered via getTemplateHtml (iframes)
// These stubs exist only to satisfy the TemplateInfo type; the component
// field is unused at runtime (all previews use getTemplateHtml).
export function TechModern({ data }: { data: PreviewData }) { return Cambridge({ data }); }
export function Pulse({ data }: { data: PreviewData })      { return Jade({ data }); }
export function HexagonPro({ data }: { data: PreviewData }) { return Horizon({ data }); }
export function SalesImpact({ data }: { data: PreviewData }) { return Horizon({ data }); }
export function Healthcare({ data }: { data: PreviewData }) { return Jade({ data }); }

export { a4H, a4W, A4_W, A4_RATIO };
