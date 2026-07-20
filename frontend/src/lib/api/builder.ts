// Resume builder: upload, profile prefill, generation job + polling, export.
import api from "./client";

export async function uploadResume(file: File | null, linkedinText?: string) {
  const form = new FormData();
  if (file) form.append("file", file);
  if (linkedinText) form.append("linkedin_text", linkedinText);
  const { data } = await api.post("/api/resume/upload", form);
  return data as { session_id: string; parsed: { raw_text: string; filename: string } };
}

export async function getSessionProfile(sessionId: string): Promise<{
  full_name: string; email: string; phone: string; linkedin: string;
  location: string; target_role: string; key_skills: string[];
}> {
  const { data } = await api.get(`/api/profile/session?session_id=${sessionId}`);
  return data;
}

export async function prefillProfile(sessionId: string): Promise<Partial<{
  full_name: string; email: string; phone: string; linkedin: string;
  location: string; target_role: string; key_skills: string;
}>> {
  const { data } = await api.get(`/api/profile/prefill?session_id=${sessionId}`);
  return data;
}

export async function saveProfile(sessionId: string, profile: Record<string, unknown>) {
  const { data } = await api.post(`/api/profile?session_id=${sessionId}`, profile);
  return data;
}

export async function saveJobDescription(sessionId: string, jobDescription: string) {
  const { data } = await api.post(`/api/job-description?session_id=${sessionId}`, {
    job_description: jobDescription,
  });
  return data;
}

export interface GenerationJobStatus {
  status: "running" | "complete" | "failed";
  stage: string;
  attempt: number;
  cycle: number;
  best_min_score: number;
  error: string | null;
  result?: PipelineResult;
}

export async function getGenerationStatus(sessionId: string): Promise<GenerationJobStatus> {
  const { data } = await api.get(`/api/generate/status?session_id=${sessionId}`, { timeout: 15_000 });
  return data as GenerationJobStatus;
}

const _sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Full pipeline generation returns PipelineResult; section regeneration returns GeneratedResume.
 *
 * Full generation runs as an ASYNC backend job: the POST returns immediately
 * and this function POLLS /generate/status until done. Every poll is a short
 * request, so flaky networks / idle-connection kills can no longer abort a
 * generation that the server is happily completing (boom.tds incident).
 * Transient poll failures are tolerated; recoverable backend failures retry
 * server-side from checkpoints and simply look like "taking longer".
 */
export async function generateResume(
  sessionId: string,
  section?: string,
  additionalInstructions?: string,
  onProgress?: (status: GenerationJobStatus, elapsedMs: number) => void,
): Promise<PipelineResult | GeneratedResume> {
  let data: unknown;
  try {
    ({ data } = await api.post(
      `/api/generate?session_id=${sessionId}`,
      { section: section ?? null, additional_instructions: additionalInstructions ?? null },
      { timeout: 270_000 },  // section regen is still synchronous; job-start is instant
    ));
  } catch (e) {
    // Builder sessions auto-expire after 24h; retrying an expired one 404s with
    // "Session not found." Surface that distinctly so the UI can send the user
    // to start a fresh session instead of looping on a dead one.
    const ax = e as { response?: { status?: number; data?: { detail?: string } } };
    if (ax.response?.status === 404 && /session not found/i.test(ax.response?.data?.detail || "")) {
      const err = new Error("Your builder session expired. Please start a new resume.") as Error & { sessionExpired?: boolean };
      err.sessionExpired = true;
      throw err;
    }
    throw e;
  }
  if (!(data as { async?: boolean })?.async) {
    return data as PipelineResult | GeneratedResume;  // section regen / legacy payload
  }

  const started = Date.now();
  const MAX_WAIT_MS = 12 * 60_000;  // generous: covers server-side checkpoint retries
  let pollFailures = 0;
  while (Date.now() - started < MAX_WAIT_MS) {
    await _sleep(4_000);
    let status: GenerationJobStatus;
    try {
      status = await getGenerationStatus(sessionId);
      pollFailures = 0;
    } catch {
      // Transient poll failure (network blip) — the JOB keeps running server-
      // side; only give up after many consecutive failures.
      if (++pollFailures >= 8) throw new Error("Lost connection while generating — please retry.");
      continue;
    }
    onProgress?.(status, Date.now() - started);
    if (status.status === "complete" && status.result) return status.result;
    if (status.status === "failed") {
      throw new Error(status.error || "Resume generation failed. Please try again.");
    }
  }
  throw new Error("Resume generation is taking unusually long — please retry in a minute.");
}

// ── AI Auto-Fix (Pro) ─────────────────────────────────────────────────────────

/** One gap the auto-fix closed using a fact from the user's own data. */
export interface AutofixAppliedItem {
  gap: string;
  path: string;
  source_quote: string;
}

export interface AutofixReport {
  applied: AutofixAppliedItem[];
  rejected_count: number;
  unfillable: { action: string; reason: string }[];
  score_before: number;
  score_after: number;
  /** True when sourced edits were found but rescored LOWER, so the service
   *  kept the user's higher-scoring version (keep-best rule). */
  reverted?: boolean;
  reverted_count?: number;
}

export interface AutofixResult {
  resume: GeneratedResume;
  eval_summary: EvalSummary;
  report: AutofixReport;
}

interface AutofixJobStatus {
  status: "running" | "complete" | "failed";
  stage: string;
  error: string | null;
  result?: AutofixResult;
}

/** Pro: fill score gaps from the user's OWN profile + original CV (never
 *  invented data). Async backend job — POST starts it, then poll status. */
export async function runAutofix(
  sessionId: string,
  onProgress?: (stage: string) => void,
): Promise<AutofixResult> {
  await api.post(`/api/sessions/${sessionId}/autofix`, {}, { timeout: 15_000 });
  const started = Date.now();
  const MAX_WAIT_MS = 4 * 60_000;
  let pollFailures = 0;
  while (Date.now() - started < MAX_WAIT_MS) {
    await _sleep(3_000);
    let status: AutofixJobStatus;
    try {
      const { data } = await api.get(`/api/sessions/${sessionId}/autofix/status`, { timeout: 15_000 });
      status = data as AutofixJobStatus;
      pollFailures = 0;
    } catch {
      if (++pollFailures >= 8) throw new Error("Lost connection during auto-fix — please retry.");
      continue;
    }
    onProgress?.(status.stage);
    if (status.status === "complete" && status.result) return status.result;
    if (status.status === "failed") throw new Error(status.error || "Auto-fix failed. Please try again.");
  }
  throw new Error("Auto-fix is taking unusually long — please retry in a minute.");
}

/** Undo a regenerate that scored lower than the session's prior best. */
export async function restorePreviousBest(sessionId: string): Promise<{ resume: GeneratedResume; eval_summary: EvalSummary }> {
  const { data } = await api.post(`/api/sessions/${sessionId}/restore-previous-best`, {}, { timeout: 15_000 });
  return data;
}

export async function exportResume(
  sessionId: string,
  includePdf = false,
  boldKeywords = true,
  /** Exact template HTML as previewed — backend prints it with headless
   *  Chromium so the PDF matches the preview pixel-for-pixel. Omitted →
   *  legacy generic PDF layout. */
  renderedHtml?: string,
) {
  let resumeData: unknown = null;
  try {
    const stored = localStorage.getItem("cvtailora_generated");
    if (stored) resumeData = JSON.parse(stored);
  } catch { /* ignore */ }
  const { data } = await api.post(
    `/api/export?session_id=${sessionId}`,
    {
      include_pdf: includePdf,
      resume_data: resumeData,
      bold_keywords: boldKeywords,
      rendered_html: renderedHtml ?? null,
    },
    { timeout: 60_000 },  // 60s — DOCX is fast; PDF can be slower
  );
  return data as { docx_file_id?: string; pdf_file_id?: string; pdf_error?: string };
}

// ── Fact-locking ──────────────────────────────────────────────────────────────

export async function uploadSampleCv(sessionId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post(`/api/resume/sample-format?session_id=${sessionId}`, form);
  return data as { filename: string; characters: number };
}

export async function setSessionTemplate(
  sessionId: string,
  templateId: string,
  accent?: string | null,
): Promise<void> {
  await api.patch(`/api/sessions/${sessionId}/template`, {
    template_id: templateId,
    accent: accent ?? "",
  });
}

export async function syncResumeToSession(sessionId: string, resume: GeneratedResume): Promise<void> {
  await api.put(`/api/sessions/${sessionId}/resume`, resume);
}

export async function setLockedFacts(sessionId: string, lockedFacts: string[]): Promise<string[]> {
  const { data } = await api.put(`/api/sessions/${sessionId}/locked-facts`, { locked_facts: lockedFacts });
  return data.locked_facts;
}

export function downloadUrl(fileId: string) {
  return `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:9000"}/api/download/${fileId}`;
}

export interface ContactInfo {
  email: string;
  phone: string;
  linkedin: string;
  location: string;
  github?: string;
  website?: string;
}

export interface ExperienceItem {
  company: string;
  role: string;
  dates: string;
  bullets: string[];
}

export interface EducationItem {
  institution: string;
  degree: string;
  dates: string;
}

export interface DynamicSection {
  title: string;
  items: string[];
}

export interface GeneratedResume {
  name: string;
  contact: ContactInfo;
  summary: string;
  experience: ExperienceItem[];
  education: EducationItem[];
  // New dynamic format — sections determined by template / reference CV
  sections?: DynamicSection[];
  // Legacy flat format — backward compat with sessions generated before dynamic sections
  skills?: string[];
  certifications?: string[];
}

export interface EvaluatorResult {
  model: string;
  score: number;
  suggestions: string[];
}

export interface CategoryScore {
  key: string;
  name: string;
  score: number;
}

/** One concrete, user-supplied fix the AI cannot make itself (real data it
 *  must never fabricate) — surfaced so the user can add it and regenerate. */
export interface UserAction {
  category: string;
  priority: "critical" | "high" | "medium";
  action: string;
  example: string;
  score_impact: number;
  /** Auto-fix explicitly determined this needs data only the user has. */
  needs_user?: boolean;
  /** Auto-fix's reason why it could not fill this from the user's sources. */
  why_ai_cannot?: string;
}

export interface UserActionsNeeded {
  threshold_not_met: boolean;
  current_score: number;
  target_score: number;
  points_needed: number;
  estimated_points_available: number;
  message: string;
  actions: UserAction[];
}

export interface EvalSummary {
  cycles: number;
  all_passed: boolean;
  min_score: number;
  /** Tier-aware threshold the score must reach (Free 70 / Plus 80 / Pro 90). */
  pass_threshold: number;
  evaluator_results: EvaluatorResult[];
  /** Profession display name resolved for this session. */
  profession: string;
  /** User's subscription tier — labels the target in the breakdown. */
  tier?: string;
  /** Per-category CV-Score breakdown (same 8 categories as the CV Score page). */
  category_scores?: CategoryScore[];
  /** Categories below pass_threshold, weakest first — "what blocked your target". */
  blocking_categories?: CategoryScore[];
  /** Set when an evaluator flagged a possible unsupported claim vs the original. */
  faithfulness_warning?: string | null;
  /** A4 page budget of the selected template (used to show page-fit status). */
  template_pages?: number;
  /** Top JD skills extracted by the job analyzer (used for export bolding). */
  key_skills?: string[];
  /** Deterministic layout QA against the page budget. */
  layout_validation?: {
    estimated_pages?: number;
    truncated?: boolean;
    page_fit?: string;
  } | null;
  /** Score-blocking fixes only the user can supply (present when below target). */
  user_actions_needed?: UserActionsNeeded | null;
  /** Set after an AI Auto-Fix run — what was filled from the user's own data. */
  autofix?: AutofixReport | null;
  /** Set when a regenerate scored LOWER than the session's prior best — that
   *  prior version is preserved server-side and can be restored. */
  regression_warning?: { previous_score: number; current_score: number } | null;
  /** True on the minimal summary returned by /restore-previous-best. */
  restored_previous_best?: boolean;
}

export interface PipelineResult {
  resume: GeneratedResume;
  eval_summary: EvalSummary;
}

export function isPipelineResult(data: PipelineResult | GeneratedResume): data is PipelineResult {
  return "resume" in data && "eval_summary" in data;
}
