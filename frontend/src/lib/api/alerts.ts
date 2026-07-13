// Daily job alerts.
import api from "./client";

// ── Job alerts ────────────────────────────────────────────────────────────────

export interface JobAlert {
  id: string;
  user_id: string;
  name: string;
  query_tags: string[];
  location_tags: string[];
  company: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_sent_at: string | null;
  /** Stamped by every scheduler run — powers the "Last checked" status line. */
  last_checked_at?: string | null;
  last_result?: string | null;
}

export async function listJobAlerts(): Promise<JobAlert[]> {
  const { data } = await api.get("/api/jobs/alerts");
  return data;
}

export async function createJobAlert(payload: {
  name: string;
  query_tags: string[];
  location_tags: string[];
  company?: string;
}): Promise<JobAlert> {
  const { data } = await api.post("/api/jobs/alerts", payload);
  return data;
}

export async function updateJobAlert(
  alertId: string,
  payload: {
    name?: string;
    query_tags?: string[];
    location_tags?: string[];
    company?: string;
  }
): Promise<JobAlert> {
  const { data } = await api.patch(`/api/jobs/alerts/${alertId}`, payload);
  return data;
}

export async function deleteJobAlert(alertId: string): Promise<void> {
  await api.delete(`/api/jobs/alerts/${alertId}`);
}

export async function toggleJobAlert(alertId: string): Promise<{ is_active: boolean }> {
  const { data } = await api.patch(`/api/jobs/alerts/${alertId}/toggle`);
  return data;
}
