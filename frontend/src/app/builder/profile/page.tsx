"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { saveProfile, prefillProfile, getAccountProfile, searchCatalogSkills } from "@/lib/api";
import { getSessionId } from "@/lib/session";
import { useStepGuard } from "@/lib/stepGuard";
import TagInput from "@/components/TagInput";
import { FiZap, FiCpu } from "react-icons/fi";

const TONES = ["Professional", "Conversational", "Executive"];

// Module-level so its identity is stable across renders. Defining it INSIDE the
// page component made React remount every input on each keystroke (cursor jumped
// out / "focus lost"). Form value + handler are passed in as props.
function Field({
  label, name, type = "text", placeholder = "", required = false, form, onChange,
}: {
  label: string; name: string; type?: string; placeholder?: string; required?: boolean;
  form: Record<string, unknown>;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <div>
      <label className="label">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        className="input"
        type={type}
        name={name}
        placeholder={placeholder}
        value={(form[name] as string) ?? ""}
        onChange={onChange}
      />
    </div>
  );
}

export default function ProfilePage() {
  useStepGuard("profile");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [prefilling, setPrefilling] = useState(true);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    linkedin: "",
    github_username: "",
    location: "",
    target_role: "",
    preferred_tone: "Professional",
    key_skills: [] as string[],
    additional_notes: "",
    work_style: {
      work_pace: "",
      problem_solving: "",
      communication: "",
      environment: "",
    },
  });

  useEffect(() => {
    const maybeSessionId = getSessionId();
    if (!maybeSessionId) { setPrefilling(false); return; }

    const sessionId = maybeSessionId;

    async function loadProfile() {
      try {
        const prefilled = await prefillProfile(sessionId);

        // If AI extraction returned nothing, fall back to account profile
        if (!prefilled || Object.values(prefilled).every(v => !v)) {
          try {
            const accountProfile = await getAccountProfile();
            if (accountProfile) {
              setForm((f) => ({
                ...f,
                full_name: accountProfile.full_name || "",
                email: accountProfile.email || "",
                phone: accountProfile.phone || "",
                linkedin: accountProfile.linkedin || "",
                location: accountProfile.location || "",
                target_role: (accountProfile.target_roles && accountProfile.target_roles.length > 0)
                  ? accountProfile.target_roles[0]
                  : "",
                key_skills: accountProfile.key_skills || [],
              }));
              return;
            }
          } catch { /* non-fatal */ }
        }

        setForm((f) => ({
          ...f,
          full_name: prefilled.full_name || "",
          email: prefilled.email || "",
          phone: prefilled.phone || "",
          linkedin: prefilled.linkedin || "",
          location: prefilled.location || "",
          target_role: prefilled.target_role || "",
          // prefill returns comma-separated string — split into array
          key_skills: prefilled.key_skills
            ? prefilled.key_skills.split(",").map((s: string) => s.trim()).filter(Boolean)
            : [],
        }));
      } catch { /* non-fatal */ }
      finally {
        setPrefilling(false);
      }
    }

    loadProfile();
  }, []);

  function onChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  function onWorkStyleChange(key: string, value: string) {
    setForm((f) => ({ ...f, work_style: { ...f.work_style, [key]: value } }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const sessionId = getSessionId();
    if (!sessionId) { toast.error("No session — please upload your resume first."); return; }
    if (!form.full_name.trim()) { toast.error("Full name is required."); return; }
    if (!form.email.trim()) { toast.error("Email is required."); return; }

    setLoading(true);
    try {
      await saveProfile(sessionId, {
        ...form,
        key_skills: form.key_skills,
      });
      toast.success("Profile saved!");
      router.push("/builder/job");
    } catch {
      toast.error("Failed to save profile.");
    } finally {
      setLoading(false);
    }
  }

  // ── AI extraction loading state ───────────────────────────────────────────
  if (prefilling) {
    return (
      <div className="w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1">Your Profile</h1>
        </div>
        <div className="card flex flex-col items-center text-center gap-5 py-14">
          {/* Spinning logo */}
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-brand-100 border-t-brand-500 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <FiCpu className="w-6 h-6 text-brand-600" />
            </div>
          </div>

          {/* Message */}
          <div className="space-y-1.5 max-w-sm">
            <p className="font-semibold text-slate-800 text-lg">Reading your resume…</p>
            <p className="text-sm text-slate-500 leading-relaxed">
              TailorMyCv's AI is extracting your details — name, skills, location and more —
              so you don't have to type them all in.
            </p>
          </div>

          {/* Animated dots */}
          <div className="flex items-center gap-1.5 mt-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-brand-400 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>

          {/* Step badge */}
          <div className="inline-flex items-center gap-1.5 text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-3 py-1.5 mt-2">
            <FiZap className="w-3 h-3" /> AI-powered
          </div>
        </div>
      </div>
    );
  }

  // ── Profile form ──────────────────────────────────────────────────────────
  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Your Profile</h1>
        <p className="text-slate-500">
          Review and fill in any missing details. Required fields must be completed.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Full Name"      name="full_name"       placeholder="Jane Doe"                      required form={form} onChange={onChange} />
          <Field label="Email"          name="email"           type="email" placeholder="jane@example.com" required form={form} onChange={onChange} />
          <Field label="Phone"          name="phone"           placeholder="+1 555 000 0000" form={form} onChange={onChange} />
          <Field label="Location"       name="location"        placeholder="New York, NY" form={form} onChange={onChange} />
          <Field label="LinkedIn URL"   name="linkedin"        placeholder="https://linkedin.com/in/jane" form={form} onChange={onChange} />
          <Field label="GitHub Username" name="github_username" placeholder="janedoe" form={form} onChange={onChange} />
          <Field label="Target Role"    name="target_role"     placeholder="Senior Software Engineer" form={form} onChange={onChange} />
        </div>

        <div>
          <label className="label">Preferred Tone</label>
          <select className="input" name="preferred_tone" value={form.preferred_tone} onChange={onChange}>
            {TONES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <label className="label">
            Key Skills
            <span className="text-slate-400 font-normal ml-1 text-xs">Type and press Enter to add</span>
          </label>
          <TagInput
            value={form.key_skills}
            onChange={(tags) => setForm((f) => ({ ...f, key_skills: tags }))}
            fetchSuggestions={searchCatalogSkills}
            placeholder="e.g. React, Python, SQL…"
          />
        </div>

        <div>
          <label className="label">Additional Notes / Achievements</label>
          <textarea
            className="input h-24 resize-none"
            name="additional_notes"
            placeholder="Any extra context you want the AI to know about…"
            value={form.additional_notes}
            onChange={onChange}
          />
        </div>

        {/* ── Work Style (optional, improves career-alignment scoring) ──────── */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-800">Work Style <span className="font-normal text-slate-400 text-xs ml-1">optional — improves fit scoring</span></p>
            <p className="text-xs text-slate-500 mt-0.5">Helps the AI assess how well your preferences match a role's culture and working environment.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label text-xs">Work Pace</label>
              <select
                className="input text-sm"
                value={form.work_style.work_pace}
                onChange={(e) => onWorkStyleChange("work_pace", e.target.value)}
              >
                <option value="">— select —</option>
                <option value="Structured / deadline-driven">Structured / deadline-driven</option>
                <option value="Flexible / exploratory">Flexible / exploratory</option>
              </select>
            </div>
            <div>
              <label className="label text-xs">Problem Solving</label>
              <select
                className="input text-sm"
                value={form.work_style.problem_solving}
                onChange={(e) => onWorkStyleChange("problem_solving", e.target.value)}
              >
                <option value="">— select —</option>
                <option value="Analytical / data-first">Analytical / data-first</option>
                <option value="Creative / intuition-first">Creative / intuition-first</option>
              </select>
            </div>
            <div>
              <label className="label text-xs">Communication</label>
              <select
                className="input text-sm"
                value={form.work_style.communication}
                onChange={(e) => onWorkStyleChange("communication", e.target.value)}
              >
                <option value="">— select —</option>
                <option value="Direct / async-first">Direct / async-first</option>
                <option value="Collaborative / sync-first">Collaborative / sync-first</option>
              </select>
            </div>
            <div>
              <label className="label text-xs">Environment Preference</label>
              <select
                className="input text-sm"
                value={form.work_style.environment}
                onChange={(e) => onWorkStyleChange("environment", e.target.value)}
              >
                <option value="">— select —</option>
                <option value="Remote">Remote</option>
                <option value="Hybrid">Hybrid</option>
                <option value="Office">Office</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-between pt-2">
          <button type="button" onClick={() => router.back()} className="btn-secondary">← Back</button>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Saving…" : "Continue →"}
          </button>
        </div>
      </form>
    </div>
  );
}
