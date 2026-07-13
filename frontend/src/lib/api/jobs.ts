// Job search, saved jobs and the application tracker (J4).
import api from "./client";

// ── Job search ────────────────────────────────────────────────────────────────

// All fields reflect the JSearch (jsearch.p.rapidapi.com) response schema.
// Nullable fields are typed as optional.
export interface Job {
  // Identity
  job_id: string;
  job_title: string;
  job_publisher?: string;            // source platform: "LinkedIn", "Indeed", etc.

  // Employer
  employer_name: string;
  employer_logo?: string;            // URL — may be null
  employer_website?: string;

  // Classification
  job_employment_type?: string;      // "FULLTIME" | "PARTTIME" | "CONTRACTOR" | "INTERN"
  job_is_remote?: boolean;
  job_function?: string;             // broad category, e.g. "Engineering"

  // Location
  job_city?: string;
  job_state?: string;
  job_country?: string;
  job_latitude?: number;
  job_longitude?: number;

  // Compensation
  job_min_salary?: number;
  job_max_salary?: number;
  job_salary_currency?: string;
  job_salary_period?: string;        // "YEAR" | "HOUR" | "MONTH"

  // Dates
  job_posted_at_datetime_utc?: string;
  job_posted_at_timestamp?: number;

  // Content
  job_description?: string;
  job_apply_link?: string;
  job_required_skills?: string[];    // may be null in many listings
  job_highlights?: {
    Qualifications?: string[];
    Responsibilities?: string[];
    Benefits?: string[];
  };

  // Server-side per-user annotation (job_match_service) — absent for
  // anonymous/incomplete profiles or jobs with no matchable text.
  match?: JobMatch;

  // Tracker fields — present only on the /api/jobs/saved response (J4).
  _saved_at?: string;
  _status?: ApplicationStatus;
  _tailored?: boolean;
  _applied_at?: string | null;
}

export interface JobMatch {
  pct: number;
  label: string;                     // "Excellent match" | "Strong match" | "Fair match" | "Low match"
  matched_skills: string[];
}

export type ApplicationStatus = "saved" | "applied" | "interview" | "offer" | "rejected";

export interface ApplicationFunnel {
  total: number;
  saved: number;
  applied: number;
  interview: number;
  offer: number;
  rejected: number;
}

export interface SearchResult {
  jobs: Job[];
  page: number;
  from_cache: boolean;
  quota_pct: number;
  quota_remaining: number;
  quota_warning: string | null;
}

export async function searchJobs(query: string, location: string, page = 1, pageSize = 10): Promise<SearchResult> {
  const params = new URLSearchParams({ query, location, page: String(page), page_size: String(pageSize) });
  const { data } = await api.get(`/api/jobs/search?${params}`);
  return data;
}

export async function getJobDetails(jobId: string): Promise<{ job: Job; quota_pct: number; quota_warning: string | null }> {
  const { data } = await api.get(`/api/jobs/details/${encodeURIComponent(jobId)}`);
  return data;
}

export interface QuotaStatus {
  provider: string;
  month: string;
  calls: number;
  limit: number;
  pct: number;
  remaining: number;
  warning: string | null;
}

export async function getJobsQuota(): Promise<QuotaStatus> {
  const { data } = await api.get("/api/jobs/quota");
  return data;
}

export async function saveJob(jobId: string, jobData: Job): Promise<void> {
  await api.post("/api/jobs/save", { job_id: jobId, job_data: jobData });
}

export async function getSavedJobs(): Promise<Job[]> {
  const { data } = await api.get("/api/jobs/saved");
  return data;
}

export async function unsaveJob(jobId: string): Promise<void> {
  await api.delete(`/api/jobs/saved/${jobId}`);
}

// ── Application tracker (J4) ──────────────────────────────────────────────────

export async function setApplicationStatus(jobId: string, status: ApplicationStatus): Promise<void> {
  await api.patch(`/api/applications/${encodeURIComponent(jobId)}/status`, { status });
}

/** Auto-capture: called on Apply / Tailor clicks so the tracker records intent. */
export async function markApplied(jobId: string, jobData: Job, tailored = false): Promise<void> {
  await api.post("/api/applications/mark-applied", { job_id: jobId, job_data: jobData, tailored });
}

export async function getApplicationStats(): Promise<ApplicationFunnel> {
  const { data } = await api.get("/api/applications/stats");
  return data;
}

export async function markJobSeen(jobId: string): Promise<void> {
  await api.post("/api/jobs/mark-seen", { job_id: jobId });
}

export async function getSeenJobIds(): Promise<string[]> {
  const res = await api.get("/api/jobs/seen");
  return res.data as string[];
}
