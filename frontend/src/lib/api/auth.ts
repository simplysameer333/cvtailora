// Auth + session bootstrap.
import api from "./client";

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  tier: "free" | "plus" | "pro";
  has_password: boolean;
}

export async function registerUser(
  email: string,
  name: string,
  password: string
): Promise<{ access_token: string; user: AuthUser }> {
  const { data } = await api.post("/api/auth/register", { email, name, password });
  return data;
}

export async function getMe(): Promise<AuthUser> {
  const { data } = await api.get("/api/auth/me");
  return data;
}

export async function createSessionFromProfile(jobDescription: string): Promise<{ session_id: string }> {
  const { data } = await api.post("/api/sessions/from-profile", { job_description: jobDescription });
  return data;
}
