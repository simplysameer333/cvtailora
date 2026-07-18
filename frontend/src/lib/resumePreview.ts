/** Shared helpers for rendering a resume into a CV template.
 *
 * Used by the Template step (renders the gallery with SAMPLE_PREVIEW, since the
 * resume isn't generated yet) and the Ready step (renders the real generated
 * resume, and compares it against the sample "template copy"). Kept in one place
 * so both steps produce byte-identical template output.
 */
import type { PreviewData } from "@/lib/cvTemplates";
import type { GeneratedResume, AccountProfile } from "@/lib/api";

/** Convert a generated resume into the flat PreviewData a template consumes. */
export function toPreviewData(resume: GeneratedResume): PreviewData {
  const skills: string[] =
    resume.skills?.length
      ? resume.skills
      : (resume.sections?.find(s => s.title.toLowerCase().includes("skill"))?.items ?? []);
  const extra_sections = (resume.sections ?? [])
    .filter(s => !s.title.toLowerCase().includes("skill"))
    .map(s => ({ title: s.title, items: s.items }));
  return {
    name:     resume.name                   || "",
    title:    resume.experience?.[0]?.role  || "",
    email:    resume.contact?.email         || "",
    phone:    resume.contact?.phone         || "",
    location: resume.contact?.location      || "",
    linkedin: resume.contact?.linkedin      || "",
    summary:  resume.summary                || "",
    skills,
    experience: (resume.experience ?? []).map(e => ({
      title: e.role, company: e.company, date: e.dates, bullets: e.bullets,
    })),
    education: (resume.education ?? []).map(e => ({
      degree: e.degree, school: e.institution, year: e.dates,
    })),
    extra_sections,
  };
}

/** Convert the user's saved profile (built from their uploaded resume) into
 *  PreviewData — used to preview templates with the user's OWN content on the
 *  Template step, before the tailored resume exists. Returns null if the
 *  profile is empty (caller falls back to SAMPLE_PREVIEW). */
export function accountProfileToPreviewData(p: AccountProfile | null): PreviewData | null {
  if (!p || (!p.full_name && !(p.experience?.length))) return null;
  const dateOf = (s?: string, e?: string) => [s, e].filter(Boolean).join(" — ");
  return {
    name:     p.full_name || "",
    title:    p.target_roles?.[0] || p.experience?.[0]?.title || "",
    email:    p.email || "",
    phone:    p.phone || "",
    location: p.location || "",
    linkedin: p.linkedin || "",
    summary:  p.summary || "",
    skills:   p.key_skills || [],
    experience: (p.experience ?? []).map(e => ({
      title: e.title, company: e.company, date: dateOf(e.start, e.end),
      bullets: e.description ? [e.description] : [],
    })),
    education: (p.education ?? []).map(e => ({
      degree: e.degree, school: e.institution, year: e.year,
    })),
    extra_sections: [
      ...(p.certifications?.length
        ? [{ title: "Certifications", items: p.certifications.map(c => [c.name, c.year].filter(Boolean).join(" — ")) }]
        : []),
      ...(p.projects?.length
        ? [{ title: "Projects", items: p.projects.map(pr => pr.name).filter(Boolean) }]
        : []),
    ],
  };
}

/** Filesystem-safe base filename derived from the candidate's name. */
export function getFilename(resume: GeneratedResume | null): string {
  if (resume?.name) return resume.name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  return "resume";
}

/** Neutral sample content — shown on the Template step (no resume yet) and as
 *  the "template copy" the Ready step compares the generated resume against. */
export const SAMPLE_PREVIEW: PreviewData = {
  name: "Alex Morgan",
  title: "Senior Product Manager",
  email: "alex.morgan@email.com",
  phone: "+1 (555) 012-3456",
  location: "San Francisco, CA",
  linkedin: "linkedin.com/in/alexmorgan",
  summary:
    "Product leader with 8+ years shipping data-driven B2B SaaS. Grew ARR 3x and cut churn 40% " +
    "through disciplined discovery and outcome-focused roadmaps.",
  skills: ["Product Strategy", "Roadmapping", "SQL", "A/B Testing", "User Research", "Stakeholder Management", "Figma", "Analytics"],
  experience: [
    { title: "Senior Product Manager", company: "NovaCloud", date: "2021 — Present",
      bullets: [
        "Drove a platform redesign that lifted activation 28% and added $4.2M ARR.",
        "Built the experimentation program now used by 6 squads.",
        "Defined the north-star metric framework adopted company-wide.",
      ] },
    { title: "Product Manager", company: "BrightData", date: "2018 — 2021",
      bullets: [
        "Launched self-serve onboarding, cutting time-to-value from 14 to 3 days.",
        "Partnered with sales to close 3 enterprise logos worth $1.8M.",
      ] },
    { title: "Associate PM", company: "Loop", date: "2016 — 2018",
      bullets: ["Shipped mobile notifications increasing DAU retention by 12%."] },
  ],
  education: [
    { degree: "B.S. Computer Science", school: "UC Berkeley", year: "2016" },
  ],
  extra_sections: [
    { title: "Certifications", items: ["Pragmatic Institute PMC-III", "AWS Cloud Practitioner"] },
    { title: "Key Achievements", items: ["Grew ARR 3x in 2 years", "Reduced churn 40%"] },
  ],
};
