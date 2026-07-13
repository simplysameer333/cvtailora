// Admin endpoints: users, audit, prompts, professions, system config, scheduler audit.
import api from "./client";

// ── Admin ─────────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  tier: string;
  is_active: boolean;
  is_superadmin: boolean;
  created_at: string | null;
}

export interface UserStats {
  user_id: string;
  session_count: number;
  resume_count: number;
  alert_count: number;
  saved_job_count: number;
}

export interface AuditEntry {
  id: string;
  user_id: string;
  user_email: string;
  user_tier?: string;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string | null;
}

export interface AuditPage {
  total: number;
  page: number;
  page_size: number;
  items: AuditEntry[];
}

export interface PromptOverride {
  key: string;
  label: string;
  body: string;
  is_override: boolean;
  default_body: string;
  category?: string;   // "builder" | "cv_score" — drives the admin sub-tabs
}

export async function adminListUsers(): Promise<AdminUser[]> {
  const { data } = await api.get("/api/admin/users");
  return data;
}

export async function adminGetUserStats(userId: string): Promise<UserStats> {
  const { data } = await api.get(`/api/admin/users/${userId}/stats`);
  return data;
}

export async function adminUpdateUser(
  userId: string,
  body: { is_active?: boolean; is_superadmin?: boolean; tier?: string },
): Promise<{ id: string; email: string; is_active: boolean; is_superadmin: boolean; tier: string }> {
  const { data } = await api.patch(`/api/admin/users/${userId}`, body);
  return data;
}

export async function adminDeleteUser(userId: string): Promise<void> {
  await api.delete(`/api/admin/users/${userId}`);
}

export async function adminListAudit(page = 1, pageSize = 50): Promise<AuditPage> {
  const { data } = await api.get(`/api/admin/audit?page=${page}&page_size=${pageSize}`);
  return data;
}

export interface AgentMemory {
  agent: string;
  description: string;
  stats: {
    runs: number;
    avg_first_score?: number;
    avg_cycles?: number;
    avg_cost_usd?: number;
    pass_rate_pct?: number;
    avg_score?: number;
  };
  weaknesses: [string, number][];
  lessons: { kind: string; text: string }[];
  updated_at: string | null;
}

export async function adminGetAgentMemory(): Promise<AgentMemory[]> {
  const { data } = await api.get("/api/admin/agent-memory");
  return data.agents ?? [];
}

export async function adminListPrompts(): Promise<PromptOverride[]> {
  const { data } = await api.get("/api/admin/prompts");
  return data;
}

export async function adminUpdatePrompt(key: string, body: string): Promise<void> {
  await api.put(`/api/admin/prompts/${key}`, { body });
}

export async function adminResetPrompt(key: string): Promise<{ default_body: string }> {
  const { data } = await api.delete(`/api/admin/prompts/${key}`);
  return data;
}

export interface AdminProfession {
  slug: string;
  display_name: string;
  keywords: string[];
  generator_context: string;
  evaluator_context: string;
  scoring_criteria: string;
  aggregator_context: string;
  evaluator_names: string[];
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export async function adminListProfessions(): Promise<AdminProfession[]> {
  const { data } = await api.get("/api/admin/professions");
  return data;
}

export async function adminCreateProfession(body: Omit<AdminProfession, "is_active" | "created_at" | "updated_at">): Promise<AdminProfession> {
  const { data } = await api.post("/api/admin/professions", body);
  return data;
}

export async function adminUpdateProfession(slug: string, body: Partial<AdminProfession>): Promise<AdminProfession> {
  const { data } = await api.patch(`/api/admin/professions/${slug}`, body);
  return data;
}

export async function adminDeleteProfession(slug: string): Promise<void> {
  await api.delete(`/api/admin/professions/${slug}`);
}

// ── System config (global admin master switches) ────────────────────────────────

export interface SystemConfig {
  alerts_enabled: boolean;
  /** Global accent palette offered as template colour variants (hex, "#rrggbb"). */
  template_accent_palette: string[];
  /** Title-token synonyms for the job-match scorer (abbrev → expansion tokens). */
  match_token_synonyms: Record<string, string[]>;
}

// ── Admin: scheduler run audit ────────────────────────────────────────────────

export interface SchedulerDelivery {
  at: string;
  type: "sent" | "no_results";
  recipient: string;
  alert_name: string;
  job_count: number;
  jobs: { title: string; employer: string }[];
}

export interface SchedulerRun {
  date: string;
  started_at: string;
  deliveries: SchedulerDelivery[];
}

export async function fetchSchedulerRuns(limit = 30): Promise<SchedulerRun[]> {
  const { data } = await api.get(`/api/admin/scheduler/runs?limit=${limit}`);
  return data as SchedulerRun[];
}

export async function fetchSystemConfig(): Promise<SystemConfig> {
  const { data } = await api.get("/api/admin/system-config");
  return data as SystemConfig;
}

export async function updateSystemConfig(patch: Partial<SystemConfig>): Promise<SystemConfig> {
  const { data } = await api.put("/api/admin/system-config", patch);
  return data as SystemConfig;
}
