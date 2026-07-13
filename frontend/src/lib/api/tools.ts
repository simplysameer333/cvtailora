// AI tools: fit score, cover letter, interview prep, salary benchmark.
import api from "./client";

// ── Fit Score ─────────────────────────────────────────────────────────────────

export interface FitScoreResult {
  overall: number;
  verdict: "Strong Fit" | "Good Fit" | "Moderate Fit" | "Weak Fit";
  skills_match: number;
  experience_match: number;
  career_alignment: number;
  matched_skills: string[];
  missing_required: string[];
  summary: string;
}

export async function checkFit(sessionId: string): Promise<FitScoreResult> {
  const res = await api.post(`/api/sessions/${sessionId}/fit-score`);
  return res.data as FitScoreResult;
}

// ── Cover Letter ───────────────────────────────────────────────────────────────

export interface CoverLetterResult {
  company_name: string;
  subject_line: string;
  recipient: string;
  opening: string;
  body_paragraphs: string[];
  closing: string;
  sign_off: string;
  candidate_name: string;
  full_text: string;
  detected_role?: string;
}

export async function generateCoverLetter(sessionId: string): Promise<CoverLetterResult> {
  const res = await api.post(`/api/sessions/${sessionId}/cover-letter`);
  return res.data as CoverLetterResult;
}

export async function getCoverLetter(sessionId: string): Promise<CoverLetterResult | null> {
  const res = await api.get(`/api/sessions/${sessionId}/cover-letter`);
  return res.data as CoverLetterResult | null;
}

export async function generateCoverLetterStandalone(
  resumeText: string,
  jobDescription: string,
  roleOverride = "",
): Promise<CoverLetterResult> {
  const res = await api.post("/api/cover-letter/generate", {
    resume_text: resumeText,
    job_description: jobDescription,
    role_override: roleOverride,
  });
  return res.data as CoverLetterResult;
}

// ── Interview Prep ─────────────────────────────────────────────────────────────

export interface InterviewQuestion {
  category: string;
  question: string;
  why_asked: string;
  key_points: string[];
}

export interface InterviewPrepResult {
  questions: InterviewQuestion[];
  prep_tip: string;
  detected_role?: string;
}

export async function generateInterviewPrep(sessionId: string): Promise<InterviewPrepResult> {
  const res = await api.post(`/api/sessions/${sessionId}/interview-prep`);
  return res.data as InterviewPrepResult;
}

export async function getInterviewPrep(sessionId: string): Promise<InterviewPrepResult | null> {
  const res = await api.get(`/api/sessions/${sessionId}/interview-prep`);
  return res.data as InterviewPrepResult | null;
}

export async function generateInterviewPrepStandalone(
  resumeText: string,
  jobDescription: string,
  roleOverride = "",
  questionCount = 15,
  additionalContext = "",
): Promise<InterviewPrepResult> {
  const res = await api.post("/api/interview-prep/generate", {
    resume_text: resumeText,
    job_description: jobDescription,
    role_override: roleOverride,
    question_count: questionCount,
    additional_context: additionalContext,
  });
  return res.data as InterviewPrepResult;
}

export async function emailInterviewPrep(result: InterviewPrepResult): Promise<void> {
  await api.post("/api/interview-prep/email", {
    questions: result.questions,
    prep_tip: result.prep_tip ?? "",
    detected_role: result.detected_role ?? "",
  });
}

// ── Salary Benchmark ───────────────────────────────────────────────────────────

export interface SalaryBenchmarkResult {
  min_salary: number | null;
  max_salary: number | null;
  currency: string;
  period: "annual" | "monthly" | "hourly";
  location_note: string;
  confidence: "high" | "medium" | "low";
  rationale: string;
  display_range: string;
}

export async function getSalaryBenchmark(sessionId: string): Promise<SalaryBenchmarkResult> {
  const res = await api.post(`/api/sessions/${sessionId}/salary-benchmark`);
  return res.data as SalaryBenchmarkResult;
}

export async function estimateSalaryStandalone(jobDescription: string): Promise<SalaryBenchmarkResult> {
  const res = await api.post("/api/salary/estimate", { job_description: jobDescription });
  return res.data as SalaryBenchmarkResult;
}
