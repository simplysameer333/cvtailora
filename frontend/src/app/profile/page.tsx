"use client";
import { useState, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import toast from "react-hot-toast";
import {
  FiUpload, FiUser, FiMail, FiPhone,
  FiMapPin, FiBriefcase, FiTag, FiFileText, FiCheck, FiLoader,
  FiPlus, FiX,
  FiBookOpen, FiAward, FiFolder, FiAlertCircle, FiArrowRight,
} from "react-icons/fi";
import {
  getAccountProfile,
  saveAccountProfile,
  uploadProfileResume,
  searchCatalogRoles,
  searchCatalogSkills,
  type AccountProfile,
  type ProfileExperience,
  type ProfileEducation,
  type ProfileProject,
  type ProfileCertification,
} from "@/lib/api";
import TagInput from "@/components/TagInput";
import ResumeLibrary from "@/components/ResumeLibrary";

type FormState = Omit<AccountProfile, "id" | "resume_text" | "completeness">;

const EMPTY: FormState = {
  full_name: "",
  email: "",
  phone: "",
  linkedin: "",
  location: "",
  target_roles: [],
  primary_skill: "",
  key_skills: [],
  summary: "",
  experience: [],
  education: [],
  projects: [],
  certifications: [],
};

const EMPTY_EXPERIENCE: ProfileExperience = { title: "", company: "", start: "", end: "", description: "" };
const EMPTY_EDUCATION: ProfileEducation = { degree: "", institution: "", year: "" };
const EMPTY_PROJECT: ProfileProject = { name: "", description: "", url: "" };
const EMPTY_CERTIFICATION: ProfileCertification = { name: "", issuer: "", year: "" };

type TabKey = "personal" | "career" | "experience" | "education" | "projects" | "certifications";

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "personal",       label: "Personal",       icon: FiUser },
  { key: "career",         label: "Career",         icon: FiBriefcase },
  { key: "experience",     label: "Experience",     icon: FiFileText },
  { key: "education",      label: "Education",      icon: FiBookOpen },
  { key: "projects",       label: "Projects",       icon: FiFolder },
  { key: "certifications", label: "Certifications", icon: FiAward },
];

// Which tab fixes each incomplete checklist item ("resume" → the upload strip, no tab)
const CHECK_TAB: Record<string, TabKey | null> = {
  basic_info: "personal",
  linkedin: "personal",
  summary: "career",
  skills: "career",
  target_roles: "career",
  experience: "experience",
  education: "education",
  resume: null,
};

// Client mirror of backend services/profile_completeness.py so the ring updates
// live while editing. Weights must match the backend (the source of truth).
function computeCompleteness(f: FormState, hasResume: boolean) {
  const items: { key: string; label: string; weight: number; complete: boolean }[] = [
    { key: "basic_info",   label: "Basic information",    weight: 20,
      complete: [f.full_name, f.email, f.phone, f.location].every((v) => v.trim() !== "") },
    { key: "linkedin",     label: "LinkedIn URL",         weight: 5,  complete: f.linkedin.trim() !== "" },
    { key: "summary",      label: "Professional summary", weight: 15, complete: f.summary.trim() !== "" },
    { key: "skills",       label: "Key skills",           weight: 15, complete: f.key_skills.length >= 5 },
    { key: "target_roles", label: "Target roles",         weight: 10, complete: f.target_roles.length > 0 },
    { key: "experience",   label: "Work experience",      weight: 15, complete: f.experience.length > 0 },
    { key: "education",    label: "Education",            weight: 10, complete: f.education.length > 0 },
    { key: "resume",       label: "Resume on file",       weight: 10, complete: hasResume },
  ];
  const percent = items.reduce((sum, i) => sum + (i.complete ? i.weight : 0), 0);
  return { percent, checklist: items };
}

function CompletenessRing({ percent }: { percent: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const color = percent >= 80 ? "#10b981" : percent >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative w-28 h-28 shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-slate-900">{percent}%</span>
        <span className="text-[10px] text-slate-400 uppercase tracking-wide">Complete</span>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [hasResume, setHasResume] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [tab, setTab] = useState<TabKey>("personal");

  useEffect(() => {
    getAccountProfile()
      .then((profile) => {
        if (profile) {
          const { id: _id, resume_text, completeness: _c, ...rest } = profile;
          setForm({
            ...EMPTY,
            ...rest,
            target_roles: rest.target_roles?.length ? rest.target_roles : [],
            experience: rest.experience ?? [],
            education: rest.education ?? [],
            projects: rest.projects ?? [],
            certifications: rest.certifications ?? [],
          });
          setHasResume(!!resume_text);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingProfile(false));
  }, []);

  function patch<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function patchItem<K extends "experience" | "education" | "projects" | "certifications">(
    field: K, index: number, item: FormState[K][number],
  ) {
    setForm((f) => {
      const list = [...f[field]] as FormState[K];
      list[index] = item;
      return { ...f, [field]: list };
    });
  }

  function removeItem(field: "experience" | "education" | "projects" | "certifications", index: number) {
    setForm((f) => ({ ...f, [field]: f[field].filter((_, i) => i !== index) }));
  }

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setUploadingResume(true);
    try {
      const { prefilled } = await uploadProfileResume(file);
      setForm((f) => ({
        ...f,
        full_name:     prefilled.full_name     || f.full_name,
        email:         prefilled.email         || f.email,
        phone:         prefilled.phone         || f.phone,
        linkedin:      prefilled.linkedin      || f.linkedin,
        location:      prefilled.location      || f.location,
        target_roles:  prefilled.target_roles?.length ? prefilled.target_roles
                       : (prefilled as { target_role?: string }).target_role
                         ? [(prefilled as { target_role?: string }).target_role!]
                         : f.target_roles,
        primary_skill: (prefilled as { primary_skill?: string }).primary_skill || f.primary_skill,
        key_skills:    prefilled.key_skills?.length ? prefilled.key_skills : f.key_skills,
        summary:       prefilled.summary       || f.summary,
        experience:     prefilled.experience?.length     ? prefilled.experience     : f.experience,
        education:      prefilled.education?.length      ? prefilled.education      : f.education,
        projects:       prefilled.projects?.length       ? prefilled.projects       : f.projects,
        certifications: prefilled.certifications?.length ? prefilled.certifications : f.certifications,
      }));
      setHasResume(true);
      toast.success("Resume parsed — review the tabs and save.");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      const status = (err as { response?: { status?: number } })?.response?.status;
      console.error("Profile resume upload failed:", status, detail, err);
      if (status === 401) {
        toast.error("Not signed in — please refresh the page.");
      } else {
        toast.error(detail ?? "Upload failed. Check the browser console for details.");
      }
    } finally {
      setUploadingResume(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    maxFiles: 1,
    disabled: uploadingResume,
  });

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await saveAccountProfile(form);
      toast.success("Profile saved!");
    } catch {
      toast.error("Failed to save profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  if (loadingProfile) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <FiLoader className="w-6 h-6 animate-spin mr-2" /> Loading profile…
      </div>
    );
  }

  const completeness = computeCompleteness(form, hasResume);
  const firstIncomplete = completeness.checklist.find((i) => !i.complete);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Profile</h1>
        <p className="text-slate-500 text-sm mt-1">
          Your career profile powers job search pre-fill and one-click resume tailoring.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px,1fr] gap-6 items-start">

        {/* ── Left rail ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-8">

          {/* Completeness */}
          <div className="card">
            <h2 className="font-semibold text-slate-800 mb-4">Profile Completeness</h2>
            <div className="flex items-center gap-4">
              <CompletenessRing percent={completeness.percent} />
              <div className="min-w-0">
                {completeness.percent === 100 ? (
                  <p className="text-sm font-semibold text-teal-600">Great job! 🎉</p>
                ) : (
                  <p className="text-sm font-semibold text-slate-800">Almost there</p>
                )}
                <p className="text-xs text-slate-500 mt-0.5">
                  {completeness.percent === 100
                    ? "Your profile is complete and ready for one-click tailoring."
                    : "A complete profile makes tailored resumes stronger."}
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-1">
              {completeness.checklist.map(({ key, label, complete }) => {
                const targetTab = CHECK_TAB[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => targetTab && setTab(targetTab)}
                    disabled={complete || !targetTab}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-left transition ${
                      complete ? "text-slate-500 cursor-default"
                        : "text-amber-700 hover:bg-amber-50 font-medium"
                    }`}
                  >
                    {complete
                      ? <FiCheck className="w-4 h-4 text-teal-500 shrink-0" />
                      : <FiAlertCircle className="w-4 h-4 text-amber-500 shrink-0" />}
                    <span className="flex-1 truncate">{label}</span>
                    {!complete && targetTab && <FiArrowRight className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
            {firstIncomplete && CHECK_TAB[firstIncomplete.key] && (
              <button
                type="button"
                onClick={() => setTab(CHECK_TAB[firstIncomplete.key]!)}
                className="btn-accent w-full mt-3 justify-center text-sm"
              >
                Improve Profile <FiArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Resume upload strip */}
          <div
            {...getRootProps()}
            className={`flex items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition cursor-pointer ${
              isDragActive
                ? "border-teal-400 bg-teal-50"
                : "border-slate-300 bg-white hover:border-teal-400 hover:bg-teal-50"
            } ${uploadingResume ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <input {...getInputProps()} />
            {uploadingResume ? (
              <FiLoader className="w-5 h-5 text-brand-600 animate-spin shrink-0" />
            ) : hasResume ? (
              <FiCheck className="w-5 h-5 text-teal-500 shrink-0" />
            ) : (
              <FiUpload className="w-5 h-5 text-slate-400 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              {uploadingResume ? (
                <p className="text-sm font-medium text-brand-700">Parsing resume…</p>
              ) : hasResume ? (
                <>
                  <p className="text-sm font-medium text-slate-800">Resume on file</p>
                  <p className="text-xs text-slate-400">Drop a new file to replace it</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-slate-800">Upload your resume</p>
                  <p className="text-xs text-slate-400">PDF or DOCX · max 5 MB · AI fills the tabs</p>
                </>
              )}
            </div>
            {!uploadingResume && (
              <span className="text-xs text-brand-600 font-medium shrink-0">
                {hasResume ? "Replace" : "Browse"}
              </span>
            )}
          </div>

        </div>

        {/* ── Right: tabbed editor ──────────────────────────────────────── */}
        <form onSubmit={handleSave} className="card flex flex-col gap-5 min-w-0">

          {/* Tab bar */}
          <div className="flex flex-wrap gap-1 border-b border-slate-200 -mx-5 sm:-mx-6 px-5 sm:px-6">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                  tab === key
                    ? "border-teal-500 text-brand-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>

          {/* ── Personal ── */}
          {tab === "personal" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Full name</label>
                <div className="relative">
                  <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="text" value={form.full_name}
                    onChange={(e) => patch("full_name", e.target.value)}
                    className="input pl-9" placeholder="Jane Smith" />
                </div>
              </div>
              <div>
                <label className="label">Email</label>
                <div className="relative">
                  <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="email" value={form.email}
                    onChange={(e) => patch("email", e.target.value)}
                    className="input pl-9" placeholder="jane@example.com" />
                </div>
              </div>
              <div>
                <label className="label">Phone</label>
                <div className="relative">
                  <FiPhone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="text" value={form.phone}
                    onChange={(e) => patch("phone", e.target.value)}
                    className="input pl-9" placeholder="+1 555 000 0000" />
                </div>
              </div>
              <div>
                <label className="label">Location</label>
                <div className="relative">
                  <FiMapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="text" value={form.location}
                    onChange={(e) => patch("location", e.target.value)}
                    className="input pl-9" placeholder="London, UK" />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="label">LinkedIn URL</label>
                <input
                  type="url"
                  value={form.linkedin}
                  onChange={(e) => patch("linkedin", e.target.value)}
                  className="input"
                  placeholder="https://linkedin.com/in/username"
                />
              </div>
            </div>
          )}

          {/* ── Career ── */}
          {tab === "career" && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="label">Target roles</label>
                <TagInput
                  value={form.target_roles}
                  onChange={(roles) => patch("target_roles", roles)}
                  fetchSuggestions={searchCatalogRoles}
                  placeholder="e.g. Software Engineer, Product Manager…"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Used to pre-fill job searches. Add one or more roles.
                </p>
              </div>
              <div>
                <label className="label">Primary skill</label>
                <TagInput
                  value={form.primary_skill ? [form.primary_skill] : []}
                  onChange={(tags) => patch("primary_skill", tags[0] ?? "")}
                  fetchSuggestions={searchCatalogSkills}
                  placeholder="e.g. Java, Python, Financial Modelling…"
                  single
                />
                <p className="text-xs text-slate-400 mt-1">
                  Your core technical or professional skill — combined with your role when searching for jobs.
                </p>
              </div>
              <div>
                <label className="label flex items-center gap-1">
                  <FiTag className="w-3.5 h-3.5" /> Key skills
                </label>
                <TagInput
                  value={form.key_skills}
                  onChange={(skills) => patch("key_skills", skills)}
                  fetchSuggestions={searchCatalogSkills}
                  placeholder="e.g. Python, React, Leadership…"
                />
              </div>
              <div>
                <label className="label">Professional summary</label>
                <textarea
                  value={form.summary}
                  onChange={(e) => patch("summary", e.target.value)}
                  className="input h-28 resize-none"
                  placeholder="2–3 sentences about your background and what you're looking for."
                />
              </div>
            </div>
          )}

          {/* ── Experience ── */}
          {tab === "experience" && (
            <div className="flex flex-col gap-4">
              {form.experience.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">
                  No work experience yet — upload a resume to auto-fill, or add one below.
                </p>
              )}
              {form.experience.map((exp, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-4 relative">
                  <button
                    type="button"
                    onClick={() => removeItem("experience", i)}
                    className="absolute top-3 right-3 p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition"
                    title="Remove"
                  >
                    <FiX className="w-4 h-4" />
                  </button>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-8">
                    <input className="input" placeholder="Job title" value={exp.title}
                      onChange={(e) => patchItem("experience", i, { ...exp, title: e.target.value })} />
                    <input className="input" placeholder="Company" value={exp.company}
                      onChange={(e) => patchItem("experience", i, { ...exp, company: e.target.value })} />
                    <input className="input" placeholder="Start (e.g. Jan 2021)" value={exp.start}
                      onChange={(e) => patchItem("experience", i, { ...exp, start: e.target.value })} />
                    <input className="input" placeholder="End (or Present)" value={exp.end}
                      onChange={(e) => patchItem("experience", i, { ...exp, end: e.target.value })} />
                  </div>
                  <textarea className="input mt-3 h-20 resize-none" placeholder="What did you do and achieve?"
                    value={exp.description}
                    onChange={(e) => patchItem("experience", i, { ...exp, description: e.target.value })} />
                </div>
              ))}
              <button type="button" className="btn-secondary self-start text-sm"
                onClick={() => patch("experience", [...form.experience, { ...EMPTY_EXPERIENCE }])}>
                <FiPlus className="w-4 h-4" /> Add Experience
              </button>
            </div>
          )}

          {/* ── Education ── */}
          {tab === "education" && (
            <div className="flex flex-col gap-4">
              {form.education.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">
                  No education yet — upload a resume to auto-fill, or add one below.
                </p>
              )}
              {form.education.map((edu, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-4 relative">
                  <button
                    type="button"
                    onClick={() => removeItem("education", i)}
                    className="absolute top-3 right-3 p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition"
                    title="Remove"
                  >
                    <FiX className="w-4 h-4" />
                  </button>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pr-8">
                    <input className="input sm:col-span-2" placeholder="Degree (e.g. BSc Computer Science)" value={edu.degree}
                      onChange={(e) => patchItem("education", i, { ...edu, degree: e.target.value })} />
                    <input className="input" placeholder="Year" value={edu.year}
                      onChange={(e) => patchItem("education", i, { ...edu, year: e.target.value })} />
                    <input className="input sm:col-span-3" placeholder="Institution" value={edu.institution}
                      onChange={(e) => patchItem("education", i, { ...edu, institution: e.target.value })} />
                  </div>
                </div>
              ))}
              <button type="button" className="btn-secondary self-start text-sm"
                onClick={() => patch("education", [...form.education, { ...EMPTY_EDUCATION }])}>
                <FiPlus className="w-4 h-4" /> Add Education
              </button>
            </div>
          )}

          {/* ── Projects ── */}
          {tab === "projects" && (
            <div className="flex flex-col gap-4">
              {form.projects.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">
                  Optional — side projects, open source, portfolio pieces.
                </p>
              )}
              {form.projects.map((proj, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-4 relative">
                  <button
                    type="button"
                    onClick={() => removeItem("projects", i)}
                    className="absolute top-3 right-3 p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition"
                    title="Remove"
                  >
                    <FiX className="w-4 h-4" />
                  </button>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-8">
                    <input className="input" placeholder="Project name" value={proj.name}
                      onChange={(e) => patchItem("projects", i, { ...proj, name: e.target.value })} />
                    <input className="input" placeholder="URL (optional)" value={proj.url}
                      onChange={(e) => patchItem("projects", i, { ...proj, url: e.target.value })} />
                  </div>
                  <textarea className="input mt-3 h-16 resize-none" placeholder="What is it and what did you build it with?"
                    value={proj.description}
                    onChange={(e) => patchItem("projects", i, { ...proj, description: e.target.value })} />
                </div>
              ))}
              <button type="button" className="btn-secondary self-start text-sm"
                onClick={() => patch("projects", [...form.projects, { ...EMPTY_PROJECT }])}>
                <FiPlus className="w-4 h-4" /> Add Project
              </button>
            </div>
          )}

          {/* ── Certifications ── */}
          {tab === "certifications" && (
            <div className="flex flex-col gap-4">
              {form.certifications.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">
                  Optional — professional certifications strengthen ATS matching.
                </p>
              )}
              {form.certifications.map((cert, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-4 relative">
                  <button
                    type="button"
                    onClick={() => removeItem("certifications", i)}
                    className="absolute top-3 right-3 p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition"
                    title="Remove"
                  >
                    <FiX className="w-4 h-4" />
                  </button>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pr-8">
                    <input className="input sm:col-span-2" placeholder="Certification (e.g. AWS Solutions Architect)" value={cert.name}
                      onChange={(e) => patchItem("certifications", i, { ...cert, name: e.target.value })} />
                    <input className="input" placeholder="Year" value={cert.year}
                      onChange={(e) => patchItem("certifications", i, { ...cert, year: e.target.value })} />
                    <input className="input sm:col-span-3" placeholder="Issuer (e.g. Amazon Web Services)" value={cert.issuer}
                      onChange={(e) => patchItem("certifications", i, { ...cert, issuer: e.target.value })} />
                  </div>
                </div>
              ))}
              <button type="button" className="btn-secondary self-start text-sm"
                onClick={() => patch("certifications", [...form.certifications, { ...EMPTY_CERTIFICATION }])}>
                <FiPlus className="w-4 h-4" /> Add Certification
              </button>
            </div>
          )}

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <button type="submit" disabled={savingProfile} className="btn-primary">
              {savingProfile ? "Saving…" : "Save Profile"}
            </button>
          </div>
        </form>
      </div>

      {/* Full-width library below the grid — the narrow rail distorted it */}
      <ResumeLibrary
        variant="full"
        subtitle="Save multiple resumes — upload directly or save tailored ones from the builder."
      />
    </div>
  );
}
