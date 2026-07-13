// CV templates (cv_templates collection) — public gallery + admin CRUD/AI-generate.
import api from "./client";
import type { CvTemplate, DocxConfig } from "@/lib/cvTemplates";

// ── CV templates (resume preview/export templates — `cv_templates` collection) ──
// `CvTemplate` / `DocxConfig` types are imported at the top of this file
// (type-only — no runtime cycle).

/** Public — active templates for the gallery / preview store. */
export async function fetchCvTemplates(): Promise<CvTemplate[]> {
  const { data } = await api.get("/api/cv-templates");
  return data as CvTemplate[];
}

/** Admin — all templates including inactive. */
export async function adminListCvTemplates(): Promise<CvTemplate[]> {
  const { data } = await api.get("/api/admin/cv-templates");
  return data as CvTemplate[];
}

export async function adminCreateCvTemplate(
  body: Partial<CvTemplate> & { name: string; html: string },
): Promise<CvTemplate> {
  const { data } = await api.post("/api/admin/cv-templates", body);
  return data as CvTemplate;
}

export async function adminUpdateCvTemplate(
  key: string,
  body: Partial<CvTemplate>,
): Promise<CvTemplate> {
  const { data } = await api.patch(`/api/admin/cv-templates/${key}`, body);
  return data as CvTemplate;
}

export async function adminDeleteCvTemplate(key: string): Promise<void> {
  await api.delete(`/api/admin/cv-templates/${key}`);
}

export interface TemplateScoreResult {
  key: string;
  name?: string;
  quality_score?: number;
  tier?: string;
  error?: string;
}

/** Admin — score every template (gold résumé → CV-Score) and store quality_score + tier. */
export async function adminRecomputeTemplateScores(): Promise<{ results: TemplateScoreResult[]; scored: number; total: number }> {
  const { data } = await api.post("/api/admin/cv-templates/recompute-scores");
  return data;
}

export interface GeneratedTemplate {
  html: string;
  docx_config: DocxConfig;
  suggested_metadata: {
    name?: string;
    category?: CvTemplate["category"];
    traits?: string[];
    bestFor?: string;
    description?: string;
    pages?: 1 | 2;
    accentColor?: string;
  };
}

/** Admin — one dedicated LLM call: author a single template from a prompt. */
export async function adminGenerateCvTemplate(
  prompt: string,
  base_key?: string,
): Promise<GeneratedTemplate> {
  const { data } = await api.post("/api/admin/cv-templates/generate", { prompt, base_key });
  return data as GeneratedTemplate;
}
