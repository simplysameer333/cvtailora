// Account profile, resume library, public sharing, stats/analytics/usage.
import api from "./client";
import type { ApplicationFunnel } from "./jobs";

// ── Account profile ───────────────────────────────────────────────────────────

export interface ProfileExperience {
  title: string;
  company: string;
  start: string;
  end: string;
  description: string;
}

export interface ProfileEducation {
  degree: string;
  institution: string;
  year: string;
}

export interface ProfileProject {
  name: string;
  description: string;
  url: string;
}

export interface ProfileCertification {
  name: string;
  issuer: string;
  year: string;
}

export interface ProfileCompleteness {
  percent: number;
  checklist: { key: string; label: string; complete: boolean }[];
}

export interface AccountProfile {
  id?: string;
  full_name: string;
  email: string;
  phone: string;
  linkedin: string;
  location: string;
  target_roles: string[];
  primary_skill: string;
  key_skills: string[];
  summary: string;
  experience: ProfileExperience[];
  education: ProfileEducation[];
  projects: ProfileProject[];
  certifications: ProfileCertification[];
  resume_text?: string;
  completeness?: ProfileCompleteness;
}

export async function searchCatalogRoles(q: string): Promise<string[]> {
  const { data } = await api.get(`/api/catalog/roles?q=${encodeURIComponent(q)}`);
  return data;
}

export async function searchCatalogSkills(q: string): Promise<string[]> {
  const { data } = await api.get(`/api/catalog/skills?q=${encodeURIComponent(q)}`);
  return data;
}

export async function getAccountProfile(): Promise<AccountProfile | null> {
  const { data } = await api.get("/api/account/profile");
  return data;
}

export async function saveAccountProfile(profile: Omit<AccountProfile, "id" | "resume_text" | "completeness">): Promise<AccountProfile> {
  const { data } = await api.put("/api/account/profile", profile);
  return data;
}

export async function uploadProfileResume(file: File): Promise<{ prefilled: Partial<AccountProfile>; resume_text: string }> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/api/account/profile/resume", form);
  return data;
}

export async function createSessionFromProfileWithJob(jobDescription: string): Promise<{ session_id: string }> {
  const { data } = await api.post("/api/sessions/from-profile", { job_description: jobDescription });
  return data;
}

// ── Resume Library ────────────────────────────────────────────────────────────

export interface SavedResume {
  id: string;
  user_id: string;
  name: string;
  type: "uploaded" | "tailored";
  file_name?: string;
  content_type?: string;
  resume_text?: string;
  tailored_for_job?: string;
  tailored_for_employer?: string;
  created_at: string;
  updated_at: string;
}

export async function listSavedResumes(): Promise<SavedResume[]> {
  const { data } = await api.get("/api/account/resumes");
  return data;
}

export async function uploadSavedResume(file: File, name?: string): Promise<SavedResume> {
  const form = new FormData();
  form.append("file", file);
  if (name) form.append("name", name);
  const { data } = await api.post("/api/account/resumes/upload", form);
  return data;
}

export async function saveResumeFromSession(
  sessionId: string,
  name: string,
  jobTitle?: string,
  employerName?: string,
): Promise<SavedResume> {
  const { data } = await api.post("/api/account/resumes/from-session", {
    session_id: sessionId,
    name,
    job_title: jobTitle,
    employer_name: employerName,
  });
  return data;
}

export async function renameSavedResume(resumeId: string, name: string): Promise<SavedResume> {
  const { data } = await api.patch(`/api/account/resumes/${resumeId}`, { name });
  return data;
}

export async function deleteSavedResume(resumeId: string): Promise<void> {
  await api.delete(`/api/account/resumes/${resumeId}`);
}

export async function createSessionFromLibraryResume(
  resumeId: string,
  jobDescription = "",
): Promise<{ session_id: string }> {
  const { data } = await api.post(`/api/account/resumes/${resumeId}/create-session`, {
    job_description: jobDescription,
  });
  return data;
}

export function savedResumeDownloadUrl(resumeId: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9000";
  return `${base}/api/account/resumes/${resumeId}/download`;
}

// ── Public CV sharing (revocable read-only links) ─────────────────────────────

export interface SharedResumeView {
  name: string;
  type: "uploaded" | "tailored";
  content_type: string | null;
  has_file: boolean;
  resume_text: string;
  shared_at?: string;
}

export async function createResumeShare(resumeId: string): Promise<{ token: string }> {
  const { data } = await api.post(`/api/account/resumes/${resumeId}/share`);
  return data;
}

export async function revokeResumeShare(resumeId: string): Promise<void> {
  await api.delete(`/api/account/resumes/${resumeId}/share`);
}

/** Map of resume_id → share token for the current user's active shares. */
export async function listResumeShares(): Promise<Record<string, string>> {
  const { data } = await api.get("/api/account/resumes/shares");
  return data;
}

/** Public — no auth required (the axios token header is simply ignored). */
export async function getSharedResume(token: string): Promise<SharedResumeView> {
  const { data } = await api.get(`/api/share/${token}`);
  return data;
}

export function sharedResumeFileUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9000";
  return `${base}/api/share/${token}/file`;
}

export interface ResumeSession {
  id: string;
  created_at: string;
  target_role: string;
  quality_label: "Excellent" | "Strong" | "Good" | "Reviewed";
  min_score: number;
}

export interface AccountStats {
  session_count: number;
  generated_count: number;
  resume_count: number;
  alert_count: number;
  active_alert_count: number;
  saved_job_count: number;
  tier: string;
  recent_sessions: ResumeSession[];
}

export async function getUserStats(): Promise<AccountStats> {
  const { data } = await api.get("/api/account/stats");
  return data;
}

export interface AccountAnalytics {
  alert_emails_sent: number;
  alert_jobs_delivered: number;
  alerts_active: number;
  resumes_generated: number;
  resumes_exported: number;
  cv_scores_run: number;
  cover_letters: number;
  interview_preps: number;
  jobs_saved: number;
  jobs_viewed: number;
  application_funnel: ApplicationFunnel;
  daily: { date: string; count: number }[];
  recent: { action: string; metadata: Record<string, unknown>; created_at: string }[];
}

export async function getAccountAnalytics(): Promise<AccountAnalytics> {
  const { data } = await api.get("/api/account/analytics");
  return data;
}

export interface AccountUsage {
  daily_used_cents: number;
  daily_cap_cents: number | null;
  monthly_used_cents: number;
  monthly_cap_cents: number | null;
  tier: string;
}

export async function getAccountUsage(): Promise<AccountUsage> {
  const { data } = await api.get("/api/account/usage");
  return data;
}
