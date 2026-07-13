// CV-Score check (async job + polling) and result permalinks.
import api from "./client";

// ── Resume Checker ──────────────────────────────────────────────────────────────

export interface CheckItem {
  label: string;
  passed: boolean;
}

export interface CheckCategory {
  key: string;
  name: string;
  score: number;
  status: "excellent" | "good" | "needs_work" | "missing";
  checks: CheckItem[];
  improvements: string[];
}

export interface ExtractedProfile {
  name: string;
  title: string;
  email: string;
  phone: string;
  location?: string;
  linkedin: string;
  summary?: string;
  skills?: string[];
  experience?: { role: string; company: string; dates: string; bullets: string[] }[];
  education?: { degree: string; institution: string; dates: string }[];
  extra_sections?: { title: string; items: string[] }[];
}

export interface ResumeCheckResult {
  overall_score: number;
  summary: string;
  categories: CheckCategory[];
  result_id?: string;  // UUID returned by the backend for permalink
  extracted_profile?: ExtractedProfile;
}

export interface CvCheckJobStatus {
  status: "running" | "complete" | "failed";
  stage: string;
  error: string | null;
  result?: ResumeCheckResult;
}

/** CV-Score check. Cache hits return synchronously; fresh analyses run as an
 * ASYNC backend job (quality check + refine cycles + extraction can exceed a
 * minute) and this function POLLS /resume/check-status until done — same
 * connection-kill-proof pattern as generateResume. */
export async function checkResume(
  file: File,
  onProgress?: (stage: string, elapsedMs: number) => void,
): Promise<ResumeCheckResult> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/api/resume/check", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  if (!(data as { async?: boolean })?.async) {
    return data as ResumeCheckResult;  // cache hit — full result immediately
  }

  const key = (data as { key: string }).key;
  const started = Date.now();
  const MAX_WAIT_MS = 6 * 60_000;
  let pollFailures = 0;
  while (Date.now() - started < MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, 3_000));
    let status: CvCheckJobStatus;
    try {
      const res = await api.get(`/api/resume/check-status?key=${key}`, { timeout: 15_000 });
      status = res.data as CvCheckJobStatus;
      pollFailures = 0;
    } catch {
      if (++pollFailures >= 8) throw new Error("Lost connection while analysing — please retry.");
      continue;
    }
    onProgress?.(status.stage, Date.now() - started);
    if (status.status === "complete" && status.result) return status.result;
    if (status.status === "failed") {
      throw new Error(status.error || "CV analysis failed. Please try again.");
    }
  }
  throw new Error("CV analysis is taking unusually long — please retry in a minute.");
}

export async function getCheckResult(resultId: string): Promise<ResumeCheckResult> {
  const { data } = await api.get(`/api/resume/check/${resultId}`);
  return data as ResumeCheckResult;
}
