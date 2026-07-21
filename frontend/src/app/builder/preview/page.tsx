"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  generateResume,
  runAutofix,
  restorePreviousBest,
  setLockedFacts,
  setSessionTemplate,
  syncResumeToSession,
  isPipelineResult,
  generateCoverLetter,
  getCoverLetter,
  generateInterviewPrep,
  getInterviewPrep,
  type GeneratedResume,
  type EvalSummary,
  type CoverLetterResult,
  type InterviewPrepResult,
} from "@/lib/api";
import { getSessionId } from "@/lib/session";
import { useStepGuard } from "@/lib/stepGuard";
import { useAuth } from "@/lib/useAuth";
import Link from "next/link";
import { FiRefreshCw, FiCheckCircle, FiShield, FiLock, FiX, FiPlus, FiMessageSquare, FiTrash2, FiZap, FiCopy, FiMail, FiBookOpen, FiChevronDown, FiChevronUp } from "react-icons/fi";
import { SUPPORT_EMAIL, hasFeature } from "@/lib/config";
import { EvalSummaryPanel } from "@/components/EvalQualityPanel";
import InfoTooltip from "@/components/InfoTooltip";
import {
  CoverLetterCard, LockedFactsPanel, Section, EditableField, InterviewPrepCard,
} from "@/components/builder/PreviewPanels";

const LS_RESUME = "cvtailora_generated";
const LS_EVAL = "cvtailora_eval_summary";
const LS_TEMPLATE = "cvtailora_template_id";
const LS_LOCKED_FACTS = "cvtailora_locked_facts";
const LS_CUSTOM_SECTIONS = "cvtailora_custom_sections";

interface CustomSection {
  id: string;
  name: string;
  content: string;
}

export default function PreviewPage() {
  useStepGuard("preview");
  const router = useRouter();
  const { data: session } = useAuth();
  const tier = session?.user?.tier ?? "free";
  const isPro = hasFeature(tier, "section_regen"); // true only for Pro
  const canAutofix = hasFeature(tier, "auto_fix"); // Pro: AI fills gaps from the user's own data
  const [resume, setResume] = useState<GeneratedResume | null>(null);
  const [evalSummary, setEvalSummary] = useState<EvalSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSection, setLoadingSection] = useState<string | null>(null);
  const [lockedFacts, setLockedFactsState] = useState<string[]>([]);
  const [newFact, setNewFact] = useState("");
  const [savingFacts, setSavingFacts] = useState(false);
  const [sectionComments, setSectionComments] = useState<Record<string, string>>({});
  const [globalComment, setGlobalComment] = useState("");
  const [showGlobalComment, setShowGlobalComment] = useState(false);
  const [customSections, setCustomSections] = useState<CustomSection[]>([]);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [boldKeywords, setBoldKeywords] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("cvtailora_bold_keywords");
    return saved === null ? true : saved === "true";
  });
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(0);
  // "Taking longer than usual" note — set from real job progress (server-side
  // checkpoint retries), shown instead of ever surfacing a recoverable error.
  const [slowNote, setSlowNote] = useState<string | null>(null);
  const [coverLetter, setCoverLetter] = useState<CoverLetterResult | null>(null);
  const [coverLetterLoading, setCoverLetterLoading] = useState(false);
  const [interviewPrep, setInterviewPrep] = useState<InterviewPrepResult | null>(null);
  const [interviewPrepLoading, setInterviewPrepLoading] = useState(false);
  const [autofixLoading, setAutofixLoading] = useState(false);
  const [restoringPrevious, setRestoringPrevious] = useState(false);

  useEffect(() => {
    const storedResume = localStorage.getItem(LS_RESUME);
    const storedEval = localStorage.getItem(LS_EVAL);
    const storedFacts = localStorage.getItem(LS_LOCKED_FACTS);
    if (storedFacts) {
      try { setLockedFactsState(JSON.parse(storedFacts)); } catch { /* ignore */ }
    }
    const storedCustom = localStorage.getItem(LS_CUSTOM_SECTIONS);
    if (storedCustom) {
      try { setCustomSections(JSON.parse(storedCustom)); } catch { /* ignore */ }
    }
    if (storedResume) {
      try {
        const parsed = JSON.parse(storedResume);
        setResume(parsed);
        if (storedEval) setEvalSummary(JSON.parse(storedEval));
        // Sync back to MongoDB so export can always find it
        const sid = getSessionId();
        if (sid) syncResumeToSession(sid, parsed).catch(() => {});
        return;
      } catch { /* fall through */ }
    }
    runGenerate();
  }, []);

  // Auto-load cover letter if one was previously generated for this session
  useEffect(() => {
    const sid = getSessionId();
    if (!sid) return;
    getCoverLetter(sid)
      .then((cl) => { if (cl?.full_text) setCoverLetter(cl); })
      .catch(() => { /* no cover letter yet — silently ignore */ });
  }, []);

  // Auto-load interview prep if one was previously generated for this session
  useEffect(() => {
    const sid = getSessionId();
    if (!sid) return;
    getInterviewPrep(sid)
      .then((prep) => { if (prep?.questions?.length) setInterviewPrep(prep); })
      .catch(() => { /* no interview prep yet — silently ignore */ });
  }, []);

  async function persistTemplateToSession(sessionId: string) {
    const templateId = localStorage.getItem(LS_TEMPLATE);
    if (!templateId) return;
    try {
      await setSessionTemplate(sessionId, templateId);
    } catch { /* non-critical */ }
  }

  function setComment(section: string, value: string) {
    setSectionComments((prev) => ({ ...prev, [section]: value }));
  }

  function addCustomSection() {
    const name = newSectionName.trim();
    if (!name) return;
    const section: CustomSection = { id: crypto.randomUUID(), name, content: "" };
    const updated = [...customSections, section];
    setCustomSections(updated);
    localStorage.setItem(LS_CUSTOM_SECTIONS, JSON.stringify(updated));
    setNewSectionName("");
    setAddingSection(false);
  }

  function updateCustomSection(id: string, content: string) {
    const updated = customSections.map((s) => s.id === id ? { ...s, content } : s);
    setCustomSections(updated);
    localStorage.setItem(LS_CUSTOM_SECTIONS, JSON.stringify(updated));
  }

  function removeCustomSection(id: string) {
    const updated = customSections.filter((s) => s.id !== id);
    setCustomSections(updated);
    localStorage.setItem(LS_CUSTOM_SECTIONS, JSON.stringify(updated));
  }

  async function runGenerate(section?: string, comment?: string) {
    const sessionId = getSessionId();
    if (!sessionId) {
      toast.error("No session found. Please start from Step 1.");
      return;
    }

    setGenerationError(null);
    setSessionExpired(false);
    if (!section) await persistTemplateToSession(sessionId);

    const additionalInstructions = section
      ? (comment?.trim() || undefined)
      : (comment?.trim() || localStorage.getItem("cvtailora_instructions") || undefined);

    section ? setLoadingSection(section) : setLoading(true);
    setSlowNote(null);
    try {
      const result = await generateResume(sessionId, section, additionalInstructions, (status, elapsed) => {
        // Server-side recoverable failures retry from checkpoints invisibly —
        // the user just sees an honest "taking longer" note, never an error.
        if (status.stage?.startsWith("recovering")) {
          setSlowNote("Taking a little longer than usual — we hit a temporary snag and resumed from where it left off.");
        } else if (elapsed > 150_000) {
          setSlowNote("Taking a bit longer than usual — still working on it. Your progress is saved.");
        }
      });

      if (isPipelineResult(result)) {
        setResume(result.resume);
        setEvalSummary(result.eval_summary);
        localStorage.setItem(LS_RESUME, JSON.stringify(result.resume));
        localStorage.setItem(LS_EVAL, JSON.stringify(result.eval_summary));
        toast.success("Resume optimized for your target role!");
      } else {
        setResume(result);
        localStorage.setItem(LS_RESUME, JSON.stringify(result));
        toast.success(section ? `${section} regenerated!` : "Resume generated!");
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; code?: string; message?: string; sessionExpired?: boolean };
      if (e?.sessionExpired) {
        // Expired session — retrying the same session would just 404 again, so
        // send the user to start a fresh one instead of offering "Try again".
        setSessionExpired(true);
        setGenerationError(
          "Your builder session expired — sessions are kept for 24 hours. Start a new resume to continue.",
        );
      } else {
        const detail = e?.response?.data?.detail;
        const isTimeout = e?.code === "ECONNABORTED" || e?.message?.includes("timeout");
        const msg = detail
          ?? (isTimeout ? "Generation timed out — the AI is taking longer than usual. Please try again." : "Resume generation failed. Please try again.");
        setGenerationError(msg);
      }
    } finally {
      setLoading(false);
      setLoadingSection(null);
    }
  }

  function updateField(path: string[], value: unknown) {
    setResume((prev) => {
      if (!prev) return prev;
      const updated = structuredClone(prev) as unknown as Record<string, unknown>;
      let node: Record<string, unknown> = updated;
      for (let i = 0; i < path.length - 1; i++) {
        node = node[path[i]] as Record<string, unknown>;
      }
      node[path[path.length - 1]] = value;
      localStorage.setItem(LS_RESUME, JSON.stringify(updated));
      return updated as unknown as GeneratedResume;
    });
  }

  async function addLockedFact() {
    const trimmed = newFact.trim();
    if (!trimmed) return;
    const updated = [...lockedFacts, trimmed];
    await persistLockedFacts(updated);
    setNewFact("");
  }

  async function removeLockedFact(index: number) {
    const updated = lockedFacts.filter((_, i) => i !== index);
    await persistLockedFacts(updated);
  }

  async function persistLockedFacts(facts: string[]) {
    const sessionId = getSessionId();
    if (!sessionId) return;
    setSavingFacts(true);
    try {
      await setLockedFacts(sessionId, facts);
      setLockedFactsState(facts);
      localStorage.setItem(LS_LOCKED_FACTS, JSON.stringify(facts));
    } catch {
      toast.error("Failed to save locked facts.");
    } finally {
      setSavingFacts(false);
    }
  }

  async function handleRestorePrevious() {
    const sessionId = getSessionId();
    if (!sessionId) { toast.error("No session found."); return; }
    setRestoringPrevious(true);
    try {
      const result = await restorePreviousBest(sessionId);
      setResume(result.resume);
      setEvalSummary(result.eval_summary);
      localStorage.setItem(LS_RESUME, JSON.stringify(result.resume));
      localStorage.setItem(LS_EVAL, JSON.stringify(result.eval_summary));
      toast.success(`Restored your previous version (${result.eval_summary.min_score}/100).`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e?.response?.data?.detail ?? "Could not restore the previous version.");
    } finally {
      setRestoringPrevious(false);
    }
  }

  async function handleAutofix() {
    const sessionId = getSessionId();
    if (!sessionId) { toast.error("No session found."); return; }
    setAutofixLoading(true);
    try {
      // Ensure the backend fixes the resume the user is looking at (inline edits live in localStorage).
      if (resume) await syncResumeToSession(sessionId, resume).catch(() => {});
      const result = await runAutofix(sessionId);
      setResume(result.resume);
      setEvalSummary(result.eval_summary);
      localStorage.setItem(LS_RESUME, JSON.stringify(result.resume));
      localStorage.setItem(LS_EVAL, JSON.stringify(result.eval_summary));
      const r = result.report;
      if (r.reverted) {
        toast(
          `Found ${r.reverted_count} improvement${r.reverted_count === 1 ? "" : "s"} in your data, but they didn't raise your score — kept your higher-scoring version (${r.score_before}).`,
          { icon: "ℹ️", duration: 7000 },
        );
      } else if (r.applied.length > 0) {
        const gained = r.score_after - r.score_before;
        toast.success(
          `Fixed ${r.applied.length} item${r.applied.length === 1 ? "" : "s"} from your own data` +
          (gained > 0 ? ` — score ${r.score_before} → ${r.score_after}` : "") +
          (r.unfillable.length > 0 ? `. ${r.unfillable.length} still need${r.unfillable.length === 1 ? "s" : ""} your input.` : "."),
          { duration: 6000 },
        );
      } else {
        toast(
          "Nothing could be safely filled — the remaining items need real details only you can add.",
          { icon: "ℹ️", duration: 6000 },
        );
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      toast.error(e?.response?.data?.detail ?? e?.message ?? "Auto-fix failed. Please try again.");
    } finally {
      setAutofixLoading(false);
    }
  }

  async function handleGenerateCoverLetter() {
    const sessionId = getSessionId();
    if (!sessionId) { toast.error("No session found."); return; }
    setCoverLetterLoading(true);
    try {
      const result = await generateCoverLetter(sessionId);
      setCoverLetter(result);
      toast.success("Cover letter generated!");
    } catch {
      toast.error("Could not generate cover letter — please try again.");
    } finally {
      setCoverLetterLoading(false);
    }
  }

  async function handleGenerateInterviewPrep() {
    const sessionId = getSessionId();
    if (!sessionId) { toast.error("No session found."); return; }
    setInterviewPrepLoading(true);
    setInterviewPrep(null);
    try {
      const result = await generateInterviewPrep(sessionId);
      setInterviewPrep(result);
      toast.success("Interview questions ready!");
    } catch {
      toast.error("Could not generate interview prep — please try again.");
    } finally {
      setInterviewPrepLoading(false);
    }
  }

  const LOADING_MESSAGES = [
    { title: "Analysing your resume and job description…",     sub: "Matching your background to the role requirements" },
    { title: "Extracting key skills from the job description…", sub: "Identifying the terms that matter most to this employer" },
    { title: "Generating your tailored resume draft…",          sub: "AI writer crafting a targeted version of your experience" },
    { title: "Quality evaluators reviewing the draft…",         sub: "Multiple AI models scoring the result" },
    { title: "Refining based on evaluation feedback…",          sub: "Addressing gaps and strengthening weak areas" },
    { title: "Selecting the best version…",                     sub: "Picking the highest-scoring iteration for you" },
    { title: "Final polish underway…",                          sub: "Almost there — wrapping up your tailored resume" },
  ];

  // Advance loading message every 7 s — never wraps back to start
  useEffect(() => {
    if (!loading) return;
    setLoadingMsg(0);
    const id = setInterval(
      () => setLoadingMsg(n => Math.min(n + 1, LOADING_MESSAGES.length - 1)),
      7000,
    );
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  if (loading) {
    const msg = LOADING_MESSAGES[loadingMsg];
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-5">
        {/* Spinner */}
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-brand-100" />
          <div className="absolute inset-0 rounded-full border-4 border-brand-600 border-t-transparent animate-spin" />
        </div>

        {/* Rotating message */}
        <div className="text-center max-w-sm">
          <p className="text-slate-800 font-semibold text-lg leading-snug transition-all duration-500">
            {msg.title}
          </p>
          <p className="text-sm text-slate-500 mt-1.5 transition-all duration-500">{msg.sub}</p>
        </div>

        {/* Forward-only progress bar */}
        <div className="w-64 mt-2">
          <div className="flex gap-1">
            {LOADING_MESSAGES.map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-1.5 rounded-full transition-all duration-700 ${
                  i < loadingMsg  ? "bg-brand-300" :
                  i === loadingMsg ? "bg-brand-600" :
                  "bg-slate-200"
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-2 text-center">
            Step {loadingMsg + 1} of {LOADING_MESSAGES.length} · Usually 30–90 seconds
          </p>
          {slowNote && (
            <p className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3 text-center">
              {slowNote}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Session expired — a distinct, non-alarming state. Retrying the same session
  // would only 404 again, so the only action offered is starting a fresh one.
  if (!resume && sessionExpired) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-5">
        <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
          <FiRefreshCw className="w-7 h-7 text-amber-500" />
        </div>
        <div className="text-center max-w-md">
          <h2 className="text-lg font-semibold text-slate-800">Your session expired</h2>
          <p className="text-sm text-slate-500 mt-2">{generationError}</p>
        </div>
        <button
          onClick={() => router.push("/builder/upload")}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition"
        >
          Start a new resume
        </button>
      </div>
    );
  }

  // Error state — generation failed, resume is still null
  if (!resume && generationError) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-5">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
          <FiRefreshCw className="w-7 h-7 text-red-400" />
        </div>
        <div className="text-center max-w-md">
          <h2 className="text-lg font-semibold text-slate-800">Resume generation failed</h2>
          <p className="text-sm text-slate-500 mt-2">{generationError}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => runGenerate()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition"
          >
            <FiRefreshCw className="w-4 h-4" />
            Try again
          </button>
          <button
            onClick={() => router.back()}
            className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition"
          >
            Go back
          </button>
        </div>
        <p className="text-xs text-slate-400">
          If the problem persists, contact{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-600 hover:underline">
            {SUPPORT_EMAIL}
          </a>
        </p>
      </div>
    );
  }

  if (!resume) return null;

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Preview &amp; Edit</h1>
            <p className="text-slate-500 text-sm mt-1">
              Click any field to edit inline, or regenerate sections with guidance.
            </p>
          </div>
          <div className="flex items-center gap-1.5 self-start sm:self-auto shrink-0">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowGlobalComment((s) => !s)}
                className={`flex items-center gap-1 text-sm btn-secondary ${showGlobalComment || globalComment ? "text-brand-600 border-brand-300" : ""}`}
              >
                <FiMessageSquare className="w-3.5 h-3.5" />
                {globalComment ? "Edit guidance" : "Regenerate with guidance"}
              </button>
              <InfoTooltip text="Full rewrite of the whole resume, steered by a note you add first (e.g. 'emphasise leadership', 'targeting a different seniority'). Use this for a different ANGLE, not for filling gaps — Auto-fix does that more safely." />
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => { runGenerate(undefined, globalComment || undefined); }}
                disabled={loading}
                className="btn-secondary gap-2"
              >
                <FiRefreshCw className={loading ? "animate-spin" : ""} /> Regenerate All
              </button>
              <InfoTooltip text="Full fresh rewrite with no notes — the biggest change you can make. Rarely needed once you've already tailored once. If it scores lower, your previous version is saved and restorable below the score card." />
            </div>
          </div>
        </div>
        {showGlobalComment && (
          <div className="card p-3 space-y-2">
            <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
              <FiMessageSquare className="w-3 h-3 text-brand-500" />
              Guidance for full regeneration
            </label>
            <textarea
              autoFocus
              className="input text-sm resize-none h-16"
              placeholder={`e.g. "I'm transitioning to product management, emphasise stakeholder experience"`}
              value={globalComment}
              onChange={(e) => setGlobalComment(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowGlobalComment(false)} className="text-xs text-slate-400 hover:text-slate-600">
                Close
              </button>
              <button
                onClick={() => { runGenerate(undefined, globalComment || undefined); setShowGlobalComment(false); }}
                disabled={loading}
                className="btn-primary text-xs py-1 px-3 disabled:opacity-50 flex items-center gap-1"
              >
                <FiRefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
                Regenerate All with feedback →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quality status panel */}
      {evalSummary && (
        <EvalSummaryPanel
          summary={evalSummary}
          canAutofix={canAutofix}
          onAutofix={handleAutofix}
          autofixLoading={autofixLoading}
          onRestorePrevious={handleRestorePrevious}
          restoringPrevious={restoringPrevious}
        />
      )}

      {/* Locked facts panel — Pro only */}
      {isPro ? (
        <LockedFactsPanel
          facts={lockedFacts}
          newFact={newFact}
          saving={savingFacts}
          onNewFactChange={setNewFact}
          onAdd={addLockedFact}
          onRemove={removeLockedFact}
        />
      ) : (
        <Link
          href="/settings/plan"
          className="card flex items-center gap-3 hover:border-brand-300 transition group"
        >
          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 group-hover:bg-brand-50">
            <FiLock className="w-4 h-4 text-slate-400 group-hover:text-brand-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-700">
              Locked Facts <span className="text-[10px] font-semibold bg-brand-100 text-brand-700 rounded px-1.5 py-0.5 ml-1">PRO</span>
            </p>
            <p className="text-xs text-slate-500">Pin facts the AI must never change — upgrade to Pro to unlock.</p>
          </div>
          <FiZap className="w-4 h-4 text-brand-500 shrink-0" />
        </Link>
      )}

      {/* Contact */}
      <Section
        title="Contact"
        onRegenerate={(comment) => runGenerate("contact", comment)}
        loading={loadingSection === "contact"}
        comment={sectionComments["contact"] ?? ""}
        onCommentChange={(v) => setComment("contact", v)}
        isPro={isPro}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <EditableField
            label="Full Name"
            value={resume.name}
            onChange={(v) => updateField(["name"], v)}
          />
          {(["email", "phone", "linkedin", "github", "website", "location"] as const).map((f) => (
            <EditableField
              key={f}
              label={f.charAt(0).toUpperCase() + f.slice(1)}
              value={resume.contact?.[f] ?? ""}
              onChange={(v) => updateField(["contact", f], v)}
            />
          ))}
        </div>
      </Section>

      {/* Summary */}
      <Section
        title="Summary"
        onRegenerate={(comment) => runGenerate("summary", comment)}
        loading={loadingSection === "summary"}
        comment={sectionComments["summary"] ?? ""}
        onCommentChange={(v) => setComment("summary", v)}
        isPro={isPro}
      >
        <textarea
          className="input h-28 resize-none text-sm"
          value={resume.summary}
          onChange={(e) => updateField(["summary"], e.target.value)}
        />
      </Section>

      {/* Experience */}
      <Section
        title="Experience"
        onRegenerate={(comment) => runGenerate("experience", comment)}
        loading={loadingSection === "experience"}
        comment={sectionComments["experience"] ?? ""}
        onCommentChange={(v) => setComment("experience", v)}
        isPro={isPro}
      >
        {resume.experience.map((job, i) => (
          <div key={i} className="border border-slate-200 rounded-lg p-4 space-y-2 mb-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <EditableField
                label="Role"
                value={job.role}
                onChange={(v) => {
                  const exp = [...resume.experience];
                  exp[i] = { ...exp[i], role: v };
                  updateField(["experience"], exp);
                }}
              />
              <EditableField
                label="Company"
                value={job.company}
                onChange={(v) => {
                  const exp = [...resume.experience];
                  exp[i] = { ...exp[i], company: v };
                  updateField(["experience"], exp);
                }}
              />
              <EditableField
                label="Dates"
                value={job.dates}
                onChange={(v) => {
                  const exp = [...resume.experience];
                  exp[i] = { ...exp[i], dates: v };
                  updateField(["experience"], exp);
                }}
              />
            </div>
            {job.bullets.map((b, bi) => (
              <div key={bi} className="flex gap-2 items-start">
                <span className="text-brand-500 mt-1.5">•</span>
                <textarea
                  className="input flex-1 text-sm resize-none"
                  rows={2}
                  value={b}
                  onChange={(e) => {
                    const exp = [...resume.experience];
                    const bullets = [...exp[i].bullets];
                    bullets[bi] = e.target.value;
                    exp[i] = { ...exp[i], bullets };
                    updateField(["experience"], exp);
                  }}
                />
              </div>
            ))}
          </div>
        ))}
      </Section>

      {/* Education */}
      <Section
        title="Education"
        onRegenerate={(comment) => runGenerate("education", comment)}
        loading={loadingSection === "education"}
        comment={sectionComments["education"] ?? ""}
        onCommentChange={(v) => setComment("education", v)}
        isPro={isPro}
      >
        {resume.education.map((ed, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
            <EditableField
              label="Institution"
              value={ed.institution}
              onChange={(v) => {
                const edu = [...resume.education];
                edu[i] = { ...edu[i], institution: v };
                updateField(["education"], edu);
              }}
            />
            <EditableField
              label="Degree"
              value={ed.degree}
              onChange={(v) => {
                const edu = [...resume.education];
                edu[i] = { ...edu[i], degree: v };
                updateField(["education"], edu);
              }}
            />
            <EditableField
              label="Dates"
              value={ed.dates}
              onChange={(v) => {
                const edu = [...resume.education];
                edu[i] = { ...edu[i], dates: v };
                updateField(["education"], edu);
              }}
            />
          </div>
        ))}
      </Section>

      {/* Dynamic sections (new format) — each section from the AI output */}
      {resume.sections && resume.sections.map((sec, i) => (
        <Section
          key={`sec-${i}`}
          title={sec.title}
          onRegenerate={(comment) => runGenerate(sec.title.toLowerCase(), comment)}
          loading={loadingSection === sec.title.toLowerCase()}
          comment={sectionComments[sec.title] ?? ""}
          onCommentChange={(v) => setComment(sec.title, v)}
          isPro={isPro}
        >
          <textarea
            className="input text-sm resize-none"
            rows={Math.max(2, Math.min(sec.items.length + 1, 6))}
            value={sec.items.join("\n")}
            onChange={(e) => {
              const updated = [...(resume.sections ?? [])];
              updated[i] = { ...updated[i], items: e.target.value.split("\n").filter(Boolean) };
              updateField(["sections"], updated);
            }}
          />
          <p className="text-xs text-slate-400 mt-1">One item per line</p>
        </Section>
      ))}

      {/* Legacy Skills + Certifications (old format sessions without sections[]) */}
      {!resume.sections && resume.skills && resume.skills.length > 0 && (
        <Section
          title="Skills"
          onRegenerate={(comment) => runGenerate("skills", comment)}
          loading={loadingSection === "skills"}
          comment={sectionComments["skills"] ?? ""}
          onCommentChange={(v) => setComment("skills", v)}
          isPro={isPro}
        >
          <textarea
            className="input text-sm resize-none"
            rows={3}
            value={resume.skills.join(", ")}
            onChange={(e) =>
              updateField(["skills"], e.target.value.split(",").map((s) => s.trim()).filter(Boolean))
            }
          />
        </Section>
      )}
      {!resume.sections && resume.certifications && resume.certifications.length > 0 && (
        <Section
          title="Certifications"
          onRegenerate={(comment) => runGenerate("certifications", comment)}
          loading={loadingSection === "certifications"}
          comment={sectionComments["certifications"] ?? ""}
          onCommentChange={(v) => setComment("certifications", v)}
          isPro={isPro}
        >
          <textarea
            className="input text-sm resize-none"
            rows={2}
            value={resume.certifications.join(", ")}
            onChange={(e) =>
              updateField(["certifications"], e.target.value.split(",").map((s) => s.trim()).filter(Boolean))
            }
          />
        </Section>
      )}

      {/* Custom sections */}
      {customSections.map((cs) => (
        <Section
          key={cs.id}
          title={cs.name}
          onRegenerate={(comment) => runGenerate(cs.name.toLowerCase(), comment)}
          loading={loadingSection === cs.name.toLowerCase()}
          comment={sectionComments[cs.id] ?? ""}
          onCommentChange={(v) => setComment(cs.id, v)}
          onDelete={() => removeCustomSection(cs.id)}
          isPro={isPro}
        >
          <textarea
            className="input text-sm resize-none"
            rows={3}
            placeholder={`Content for ${cs.name}…`}
            value={cs.content}
            onChange={(e) => updateCustomSection(cs.id, e.target.value)}
          />
        </Section>
      ))}

      {/* Add section */}
      {addingSection ? (
        <div className="card p-4 flex gap-2 items-center">
          <input
            autoFocus
            className="input text-sm flex-1"
            placeholder="Section name (e.g. Projects, Publications, Volunteer Work)"
            value={newSectionName}
            onChange={(e) => setNewSectionName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addCustomSection(); if (e.key === "Escape") { setAddingSection(false); setNewSectionName(""); } }}
          />
          <button onClick={addCustomSection} disabled={!newSectionName.trim()} className="btn-primary text-sm py-2 disabled:opacity-40">
            Add
          </button>
          <button onClick={() => { setAddingSection(false); setNewSectionName(""); }} className="text-sm text-slate-400 hover:text-slate-600">
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAddingSection(true)}
          className="w-full card p-3 text-sm text-slate-500 hover:text-brand-600 hover:border-brand-300 flex items-center justify-center gap-2 transition"
        >
          <FiPlus className="w-4 h-4" /> Add Section
        </button>
      )}

      {/* Bold keywords option */}
      <div className="card p-4 flex items-start gap-3">
        <input
          id="bold-keywords"
          type="checkbox"
          checked={boldKeywords}
          onChange={e => {
            setBoldKeywords(e.target.checked);
            localStorage.setItem("cvtailora_bold_keywords", String(e.target.checked));
          }}
          className="mt-0.5 w-4 h-4 accent-brand-600 cursor-pointer shrink-0"
        />
        <div>
          <label htmlFor="bold-keywords" className="text-sm font-semibold text-slate-800 cursor-pointer">
            Bold key skills in the exported document
          </label>
          <p className="text-xs text-slate-500 mt-0.5">
            When checked, skills and keywords matched from the job description are highlighted bold in the generated DOCX and PDF — making them stand out to recruiters.
          </p>
        </div>
      </div>

      {/* Additional Instructions */}
      <div className="card p-4">
        <label className="text-sm font-semibold text-slate-800">
          Additional Instructions <span className="text-xs font-normal text-slate-400">(optional)</span>
        </label>
        <p className="text-xs text-slate-500 mt-0.5 mb-2">Used when regenerating — e.g. &ldquo;Focus on leadership experience&rdquo; or &ldquo;I&apos;m switching to product management&rdquo;.</p>
        <textarea
          className="input resize-none text-sm h-20"
          placeholder={`e.g. "Emphasise open-source work", "I'm switching to product management"`}
          defaultValue={typeof window !== "undefined" ? (localStorage.getItem("cvtailora_instructions") ?? "") : ""}
          onChange={(e) => localStorage.setItem("cvtailora_instructions", e.target.value)}
        />
      </div>

      {/* ── Cover Letter ── */}
      <CoverLetterCard
        coverLetter={coverLetter}
        loading={coverLetterLoading}
        onGenerate={handleGenerateCoverLetter}
        onRegenerate={handleGenerateCoverLetter}
      />

      {/* ── Interview Prep ── */}
      <InterviewPrepCard
        prep={interviewPrep}
        loading={interviewPrepLoading}
        onGenerate={handleGenerateInterviewPrep}
        onRegenerate={handleGenerateInterviewPrep}
      />

      <div className="flex justify-between pt-2">
        <button onClick={() => router.back()} className="btn-secondary">
          ← Back
        </button>
        <button onClick={() => router.push("/builder/ready")} className="btn-primary">
          Finish &amp; Download →
        </button>
      </div>
    </div>
  );
}


// ── Cover Letter card ──────────────────────────────────────────────────────────


