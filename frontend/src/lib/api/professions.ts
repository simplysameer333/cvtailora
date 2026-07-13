// Profession configs (public endpoints).
import api from "./client";

// ── Professions ───────────────────────────────────────────────────────────────

export interface Profession {
  slug: string;
  display_name: string;
  keywords: string[];
  generator_context: string;
  evaluator_context: string;
  scoring_criteria: string;
  aggregator_context: string;
  /** Names of evaluators to run for this profession. Empty = use all configured. */
  evaluator_names: string[];
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export async function listProfessions(): Promise<Profession[]> {
  const { data } = await api.get("/api/professions");
  return data;
}

export async function getProfession(slug: string): Promise<Profession> {
  const { data } = await api.get(`/api/professions/${slug}`);
  return data;
}

export async function createProfession(
  payload: Omit<Profession, "is_active" | "created_at" | "updated_at">
): Promise<Profession> {
  const { data } = await api.post("/api/professions", payload);
  return data;
}

export async function updateProfession(
  slug: string,
  payload: Partial<Profession>
): Promise<Profession> {
  const { data } = await api.put(`/api/professions/${slug}`, payload);
  return data;
}

export async function deleteProfession(slug: string): Promise<void> {
  await api.delete(`/api/professions/${slug}`);
}
