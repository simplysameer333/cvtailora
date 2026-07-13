"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  FiSearch, FiMapPin, FiBookmark, FiZap, FiExternalLink,
  FiClock, FiDollarSign, FiBriefcase, FiWifi, FiUser,
  FiAlertTriangle, FiX, FiFileText, FiBell, FiEdit2,
  FiTrash2, FiPlusCircle, FiToggleLeft, FiToggleRight, FiLock,
} from "react-icons/fi";
import {
  searchJobs, saveJob, unsaveJob, getSavedJobs,
  markJobSeen, getSeenJobIds,
  getAccountProfile, createSessionFromProfileWithJob,
  getJobsQuota, searchCatalogRoles,
  listJobAlerts, deleteJobAlert, toggleJobAlert,
  markApplied,
  type Job, type QuotaStatus, type JobAlert, type ProfileCompleteness,
} from "@/lib/api";
import { setSessionId } from "@/lib/session";
import { useAuth } from "@/lib/useAuth";
import ResumePickerModal from "@/components/ResumePickerModal";
import CreateAlertModal from "@/components/CreateAlertModal";
import JobMatchBadge from "@/components/JobMatchBadge";
import MatchFilterChips from "@/components/MatchFilterChips";
import ApplicationTracker from "@/components/ApplicationTracker";
import ProfileCompletenessCard from "@/components/ProfileCompletenessCard";
import PageBanner from "@/components/PageBanner";
import ApplyChoiceModal from "@/components/ApplyChoiceModal";
import TagInput from "@/components/TagInput";
import { JobCard, AlertCard, FreeSearchBanner } from "@/components/jobs/JobCards";
import { JSEARCH_PAGE_SIZES, JSEARCH_DEFAULT_PAGE_SIZE, type JsearchPageSize } from "@/lib/config";
import { getTierLimitDynamic } from "@/lib/tierConfig";

const DEV = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";

// Rotating status messages shown while a job search is in flight (it can take a
// while — the backend hits a live job-search API across multiple boards).
const JOB_LOADING_MESSAGES = [
  { title: "Searching live job boards…",      sub: "Indeed, LinkedIn, Glassdoor and more" },
  { title: "Matching roles to your search…",  sub: "Filtering by title, skills and location" },
  { title: "Pulling salaries & job details…", sub: "Compensation, employment type and posting dates" },
  { title: "Checking your saved jobs…",        sub: "Syncing so we can mark ones you've kept" },
  { title: "Almost there…",                    sub: "Assembling and ranking your results" },
];

// ── Mock data — shown on localhost before first search ────────────────────────
const MOCK_JOBS: Job[] = [
  {
    job_id: "mock-1", job_title: "Senior Frontend Engineer", employer_name: "Stripe",
    employer_logo: "https://logo.clearbit.com/stripe.com", job_employment_type: "FULLTIME",
    job_is_remote: true, job_city: "San Francisco", job_state: "CA", job_country: "US",
    job_min_salary: 160000, job_max_salary: 210000, job_salary_currency: "$", job_salary_period: "YEAR",
    job_posted_at_datetime_utc: new Date(Date.now() - 2 * 86400000).toISOString(), job_apply_link: "https://example.com/apply",
    job_publisher: "LinkedIn", job_required_skills: ["React", "TypeScript", "Next.js", "CSS"],
    job_description: "We're looking for a Senior Frontend Engineer to join the product team. Strong React and TypeScript skills required.",
  },
  {
    job_id: "mock-2", job_title: "Product Manager — Growth", employer_name: "Notion",
    employer_logo: "https://logo.clearbit.com/notion.so", job_employment_type: "FULLTIME",
    job_is_remote: false, job_city: "New York", job_state: "NY", job_country: "US",
    job_min_salary: 140000, job_max_salary: 175000, job_salary_currency: "$", job_salary_period: "YEAR",
    job_posted_at_datetime_utc: new Date(Date.now() - 1 * 86400000).toISOString(), job_apply_link: "https://example.com/apply",
    job_publisher: "Indeed", job_required_skills: ["Product Strategy", "A/B Testing", "SQL"],
    job_description: "Own the self-serve acquisition and activation funnel working cross-functionally with engineering, design, and data.",
  },
  {
    job_id: "mock-3", job_title: "Executive Chef", employer_name: "The Ritz-Carlton",
    employer_logo: "https://logo.clearbit.com/ritzcarlton.com", job_employment_type: "FULLTIME",
    job_is_remote: false, job_city: "London", job_state: "", job_country: "UK",
    job_min_salary: 70000, job_max_salary: 90000, job_salary_currency: "£", job_salary_period: "YEAR",
    job_posted_at_datetime_utc: new Date(Date.now() - 4 * 86400000).toISOString(), job_apply_link: "https://example.com/apply",
    job_publisher: "Hospitality Jobs", job_required_skills: ["Menu Development", "Kitchen Management", "HACCP"],
    job_description: "Lead culinary operations at one of London's most prestigious hotels. Oversee a team of 40 kitchen staff.",
  },
  {
    job_id: "mock-4", job_title: "3D Character Animator", employer_name: "Framestore",
    employer_logo: "https://logo.clearbit.com/framestore.com", job_employment_type: "FULLTIME",
    job_is_remote: false, job_city: "London", job_state: "", job_country: "UK",
    job_min_salary: 45000, job_max_salary: 65000, job_salary_currency: "£", job_salary_period: "YEAR",
    job_posted_at_datetime_utc: new Date(Date.now() - 6 * 86400000).toISOString(), job_apply_link: "https://example.com/apply",
    job_publisher: "LinkedIn", job_required_skills: ["Maya", "Character Animation", "Rigging"],
    job_description: "Join the award-winning animation team on major film and TV productions.",
  },
  {
    job_id: "mock-5", job_title: "HR Business Partner", employer_name: "Shopify",
    employer_logo: "https://logo.clearbit.com/shopify.com", job_employment_type: "FULLTIME",
    job_is_remote: true, job_city: "Ottawa", job_state: "ON", job_country: "Canada",
    job_min_salary: 95000, job_max_salary: 120000, job_salary_currency: "$", job_salary_period: "YEAR",
    job_posted_at_datetime_utc: new Date(Date.now() - 3 * 86400000).toISOString(), job_apply_link: "https://example.com/apply",
    job_publisher: "Indeed", job_required_skills: ["HRBP", "Performance Management", "Talent Development"],
    job_description: "Partner with engineering and product leadership to deliver people programs that scale.",
  },
  {
    job_id: "mock-6", job_title: "Secondary Maths Teacher", employer_name: "Ark Schools",
    employer_logo: "", job_employment_type: "FULLTIME",
    job_is_remote: false, job_city: "Birmingham", job_state: "", job_country: "UK",
    job_posted_at_datetime_utc: new Date(Date.now() - 8 * 86400000).toISOString(), job_apply_link: "https://example.com/apply",
    job_publisher: "TES", job_required_skills: ["Mathematics", "Curriculum Design", "QTS"],
    job_description: "Teach Key Stage 3–5 Mathematics at a high-performing academy. NQTs welcome.",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────


const MAX_PAGES = 10;

function getPaginationPages(current: number, max: number): (number | "...")[] {
  if (max <= 7) return Array.from({ length: max }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "...", max];
  if (current >= max - 3) return [1, "...", max - 4, max - 3, max - 2, max - 1, max];
  return [1, "...", current - 1, current, current + 1, "...", max];
}

// ── Free-tier upsell strip ────────────────────────────────────────────────────


export default function JobsPage() {
  const { data: session } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tier = session?.user?.tier ?? "free";
  const isFree = tier === "free";

  // ── Search state ────────────────────────────────────────────────────────────
  const [queryTags, setQueryTags] = useState<string[]>([]);
  const [locationTags, setLocationTags] = useState<string[]>([]);
  // Typed-but-not-yet-committed text in the inputs (no Enter pressed). Included in
  // the search so e.g. "Dubai" typed in the location box is actually used.
  const [pendingQuery, setPendingQuery] = useState("");
  const [pendingLocation, setPendingLocation] = useState("");
  // The exact query/location sent to the last search — pagination reuses these so
  // page 2+ keeps the same location instead of rebuilding from committed tags only.
  const lastSearchRef = useRef<{ q: string; loc: string }>({ q: "", loc: "" });
  const [pageSize, setPageSize] = useState<JsearchPageSize>(JSEARCH_DEFAULT_PAGE_SIZE);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [hasProfileResume, setHasProfileResume] = useState(false);
  const [completeness, setCompleteness] = useState<ProfileCompleteness | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [hideViewed, setHideViewed] = useState(false);
  const [minMatch, setMinMatch] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(0);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [quotaWarningDismissed, setQuotaWarningDismissed] = useState<string | null>(null);
  const [pickerJob, setPickerJob] = useState<Job | null>(null);
  const [applyJob, setApplyJob] = useState<Job | null>(null);

  // ── Alerts state ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"results" | "applications" | "alerts">(
    (["applications", "alerts"].includes(searchParams.get("tab") ?? "")
      ? searchParams.get("tab")
      : "results") as "results" | "applications" | "alerts"
  );
  const [alerts, setAlerts] = useState<JobAlert[]>([]);
  const [alertsLoaded, setAlertsLoaded] = useState(false);
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<JobAlert | undefined>();

  // Rotate the loading messages while a search is in flight.
  useEffect(() => {
    if (!loading) { setLoadingMsg(0); return; }
    const id = setInterval(
      () => setLoadingMsg((m) => (m + 1) % JOB_LOADING_MESSAGES.length),
      2200,
    );
    return () => clearInterval(id);
  }, [loading]);

  // ── Search ──────────────────────────────────────────────────────────────────
  const runSearch = useCallback(async (q: string, loc: string, p: number, ps: number) => {
    if (!q.trim()) return;
    lastSearchRef.current = { q, loc };
    setLoading(true);
    try {
      const result = await searchJobs(q, loc, p, ps);
      setJobs(result.jobs);
      setMinMatch(0); // reset the match filter for fresh results
      setHasMore(result.jobs.length >= ps);
      setSearched(true);
      if (result.quota_pct !== undefined) {
        setQuota((prev) => prev
          ? {
              ...prev,
              pct: result.quota_pct,
              remaining: result.quota_remaining,
              warning: result.quota_warning,
              calls: prev.limit - result.quota_remaining,
            }
          : null
        );
      }
      try {
        const [saved, seen] = await Promise.all([getSavedJobs(), getSeenJobIds()]);
        setSavedIds(new Set(saved.map((j) => j.job_id)));
        setSeenIds(new Set(seen));
      } catch { /* non-fatal */ }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      if (status === 503) {
        toast.error("Job search API key not configured. Add RAPIDAPI_KEY to backend .env.");
      } else if (status === 429) {
        toast.error(msg ?? "Quota exhausted for this month.");
      } else {
        toast.error(msg ?? "Search failed. Check your query and try again.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Pre-fill search from profile on mount
  useEffect(() => {
    // search available to all tiers
    getAccountProfile()
      .then((profile) => {
        const tags: string[] = [];
        if (profile?.target_roles?.length) tags.push(...profile.target_roles);
        if (profile?.primary_skill) tags.push(profile.primary_skill);
        const locTags = profile?.location ? [profile.location] : [];
        if (tags.length) setQueryTags(tags);
        if (locTags.length) setLocationTags(locTags);
        setHasProfileResume(!!profile?.resume_text);
        setCompleteness(profile?.completeness ?? null);
        setProfileLoaded(true);
        if (tags.length) runSearch(tags.join(" "), locTags.join(" OR "), 1, JSEARCH_DEFAULT_PAGE_SIZE);
      })
      .catch(() => setProfileLoaded(true));
    getJobsQuota().then(setQuota).catch(() => {});
  }, [isFree, runSearch]);

  // Load alerts when tab becomes active
  useEffect(() => {
    if (activeTab !== "alerts" || alertsLoaded || isFree) return;
    listJobAlerts()
      .then((data) => { setAlerts(data); setAlertsLoaded(true); })
      .catch(() => setAlertsLoaded(true));
  }, [activeTab, alertsLoaded, isFree]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    // Include any text typed but not committed as a tag (no Enter pressed).
    const q = [...queryTags, pendingQuery.trim()].filter(Boolean).join(" ");
    const loc = [...locationTags, pendingLocation.trim()].filter(Boolean).join(" OR ");
    if (!q.trim()) return;
    setPage(1);
    setHasMore(false);
    await runSearch(q, loc, 1, pageSize);
  }

  async function handleSave(job: Job) {
    if (savedIds.has(job.job_id)) {
      try {
        await unsaveJob(job.job_id);
        setSavedIds((prev) => { const s = new Set(prev); s.delete(job.job_id); return s; });
        toast.success("Removed from saved jobs.");
      } catch { toast.error("Failed to unsave."); }
    } else {
      try {
        await saveJob(job.job_id, job);
        setSavedIds((prev) => new Set(prev).add(job.job_id));
        toast.success("Job saved!");
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        toast.error(msg ?? "Failed to save job.");
      }
    }
  }

  function handleTailor(job: Job) {
    markJobSeen(job.job_id).catch(() => {});
    setSeenIds((prev) => new Set(prev).add(job.job_id));
    // Auto-capture: tailoring for a job records it as applied+tailored in the tracker
    if (!isFree) markApplied(job.job_id, job, true).catch(() => {});
    const jd = [
      `${job.job_title} at ${job.employer_name}`,
      job.job_description ?? "",
    ].filter(Boolean).join("\n\n");
    localStorage.setItem("cvtailora_prefill_jd", jd);
    localStorage.setItem("cvtailora_tailor_context", JSON.stringify({
      title:      job.job_title,
      employer:   job.employer_name,
      apply_link: job.job_apply_link || "",
    }));
    const params = new URLSearchParams({
      tailor_title:    job.job_title,
      tailor_employer: job.employer_name,
    });
    router.push(`/builder/upload?${params.toString()}`);
  }

  function handleApply(job: Job) {
    markJobSeen(job.job_id).catch(() => {});
    setSeenIds((prev) => new Set(prev).add(job.job_id));
    // Auto-capture: clicking Apply advances the job to "applied" in the tracker
    if (!isFree) markApplied(job.job_id, job).catch(() => {});
  }

  function handleManualApply(job: Job) {
    handleApply(job);
    window.open(job.job_apply_link, "_blank", "noopener,noreferrer");
  }

  // ── Alert handlers ──────────────────────────────────────────────────────────

  function openCreateAlert() {
    setEditingAlert(undefined);
    setAlertModalOpen(true);
  }

  function openEditAlert(alert: JobAlert) {
    setEditingAlert(alert);
    setAlertModalOpen(true);
  }

  function handleAlertSaved(saved: JobAlert) {
    setAlerts((prev) => {
      const idx = prev.findIndex((a) => a.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
  }

  async function handleToggleAlert(id: string) {
    try {
      const { is_active } = await toggleJobAlert(id);
      setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, is_active } : a));
    } catch { toast.error("Failed to update alert."); }
  }

  async function handleDeleteAlert(id: string) {
    try {
      await deleteJobAlert(id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      toast.success("Alert deleted.");
    } catch { toast.error("Failed to delete alert."); }
  }

  const alertCount = alerts.length;
  const plusAlertLimit = getTierLimitDynamic("plus", "job_alerts") ?? 5;
  const atPlusLimit = tier === "plus" && alertCount >= plusAlertLimit;

  return (
    <div className="flex flex-col gap-5">
      <PageBanner
        icon={FiBriefcase}
        title="Find Jobs"
        subtitle="Search roles from Indeed, LinkedIn, Glassdoor and more — then tailor your resume in one click."
      />

      {/* Free-tier banner — search allowed but actions locked */}
      {isFree && <FreeSearchBanner />}

      {/* Two columns at xl: results + side rail (rail fills the previously empty margin) */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr),360px] gap-6 items-start">
      <div className="flex flex-col gap-6 min-w-0">
          {/* Profile nudge */}
          {profileLoaded && !hasProfileResume && (
            <div className="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm">
              <FiUser className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-medium text-brand-800">Set up your profile</span>
                <span className="text-brand-700"> to pre-fill job searches and skip resume re-upload when tailoring. </span>
                <a href="/profile" className="font-semibold text-brand-600 underline underline-offset-2">Go to Profile →</a>
              </div>
            </div>
          )}

          {/* Quota warning banner */}
          {quota?.warning && quota.warning !== quotaWarningDismissed && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
              <FiAlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="flex-1">
                <span className="font-medium text-amber-800">Quota notice — </span>
                <span className="text-amber-700">{quota.warning}</span>
                <span className="text-amber-600 ml-2 text-xs">
                  ({quota.calls}/{quota.limit} calls used this month)
                </span>
              </div>
              <button
                onClick={() => setQuotaWarningDismissed(quota.warning)}
                className="text-amber-400 hover:text-amber-600 transition shrink-0"
                aria-label="Dismiss"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Search bar */}
          <form onSubmit={handleSearch} className="card flex flex-col sm:flex-row sm:items-stretch gap-3 !p-3">
            <div className="flex-1 min-w-0">
              <TagInput
                value={queryTags}
                onChange={setQueryTags}
                onInputChange={setPendingQuery}
                fetchSuggestions={searchCatalogRoles}
                placeholder="Job title, keywords, or company…"
                className="h-full"
              />
            </div>
            <div className="flex-1 min-w-0">
              <TagInput
                value={locationTags}
                onChange={setLocationTags}
                onInputChange={setPendingLocation}
                fetchSuggestions={async () => []}
                placeholder="City, country, or Remote…"
                className="h-full"
              />
            </div>
            <div className="flex gap-2 shrink-0 self-end">
              <button type="submit" disabled={loading || (!queryTags.length && !pendingQuery.trim())} className="btn-primary">
                {loading ? "Searching…" : "Search"}
              </button>
              {/* Save as alert — brand-coloured, visible when query exists */}
              {queryTags.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setEditingAlert(undefined); setAlertModalOpen(true); }}
                  title="Save this search as a daily job alert"
                  className="btn-accent !px-3 !py-2 shrink-0 gap-1.5"
                >
                  <FiBell className="w-4 h-4" />
                  <span className="hidden sm:inline">Save Alert</span>
                </button>
              )}
            </div>
          </form>

          {/* Tab bar */}
          <div className="flex items-center gap-1 border-b border-slate-200 -mb-3">
            <button
              onClick={() => setActiveTab("results")}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "results"
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Results
            </button>
            <button
              onClick={() => setActiveTab("applications")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "applications"
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <FiBriefcase className="w-3.5 h-3.5" />
              Applications
            </button>
            <button
              onClick={() => setActiveTab("alerts")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "alerts"
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <FiBell className="w-3.5 h-3.5" />
              My Alerts
              {alertsLoaded && alertCount > 0 && (
                <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold leading-none ${
                  activeTab === "alerts"
                    ? "bg-brand-100 text-brand-600"
                    : "bg-slate-100 text-slate-500"
                }`}>
                  {alertCount}
                </span>
              )}
            </button>
          </div>

          {/* ── Results tab ──────────────────────────────────────────────────── */}
          {activeTab === "results" && (
            <>
              {loading && (
                <div className="flex flex-col gap-3">
                  {/* Spinner + rotating status — search hits a live API and can take a while */}
                  <div className="card flex items-center gap-4 py-5 border-brand-100 bg-gradient-to-br from-brand-50/60 to-white">
                    <div className="relative w-10 h-10 shrink-0">
                      <div className="absolute inset-0 rounded-full border-4 border-brand-100" />
                      <div className="absolute inset-0 rounded-full border-4 border-brand-600 border-t-transparent animate-spin" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 text-sm leading-snug">{JOB_LOADING_MESSAGES[loadingMsg].title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{JOB_LOADING_MESSAGES[loadingMsg].sub}</p>
                    </div>
                  </div>
                  {/* Skeleton placeholders for the incoming results */}
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="card flex items-start gap-4 animate-pulse">
                      <div className="w-12 h-12 rounded-xl bg-slate-200 shrink-0" />
                      <div className="flex-1 flex flex-col gap-2.5">
                        <div className="h-4 bg-slate-200 rounded-md w-1/2" />
                        <div className="h-3 bg-slate-100 rounded-md w-1/3" />
                        <div className="h-3 bg-slate-100 rounded-md w-2/3" />
                        <div className="flex gap-2 mt-0.5">
                          <div className="h-7 w-24 bg-slate-200 rounded-lg" />
                          <div className="h-7 w-28 bg-slate-100 rounded-lg" />
                          <div className="h-7 w-16 bg-slate-100 rounded-lg" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!loading && searched && jobs.length === 0 && (
                <div className="card text-center py-12 text-slate-500">
                  No jobs found for <strong>{queryTags.join(", ")}</strong>
                  {locationTags.length > 0 ? ` in ${locationTags.join(", ")}` : ""}. Try broader keywords.
                </div>
              )}

              {!loading && !searched && (
                DEV ? (
                  <>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="flex-1 border-t border-slate-200" />
                      Sample listings (dev mode) — search above for live results
                      <span className="flex-1 border-t border-slate-200" />
                    </div>
                    <div className="flex flex-col gap-3">
                      {MOCK_JOBS.map((job) => (
                        <JobCard key={job.job_id} job={job} saved={savedIds.has(job.job_id)}
                          seen={seenIds.has(job.job_id)} isFree={isFree}
                          onSave={handleSave}
                          onUseSaved={(j) => setPickerJob(j)} onApply={handleApply}
                          onApplyChoice={(j) => setApplyJob(j)} />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="card text-center py-14 flex flex-col items-center gap-3 text-slate-400">
                    <FiSearch className="w-8 h-8 text-slate-300" />
                    <p className="text-sm font-medium text-slate-500">Enter a job title above to search live listings</p>
                    <p className="text-xs">Results are pulled in real time from major job boards</p>
                  </div>
                )
              )}

              {!loading && jobs.length > 0 && (
                <>
                  {(() => {
                    const viewedCount = jobs.filter((j) => seenIds.has(j.job_id)).length;
                    const afterViewed = hideViewed ? jobs.filter((j) => !seenIds.has(j.job_id)) : jobs;
                    const visibleJobs = minMatch > 0
                      ? afterViewed.filter((j) => (j.match?.pct ?? -1) >= minMatch)
                      : afterViewed;
                    return (
                      <>
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <div className="flex items-center gap-3">
                            <span>{jobs.length} result{jobs.length !== 1 ? "s" : ""} · page {page}</span>
                            {viewedCount > 0 && (
                              <button
                                onClick={() => setHideViewed((v) => !v)}
                                className="flex items-center gap-1 font-medium text-slate-500 hover:text-brand-600 transition"
                              >
                                {hideViewed
                                  ? `Show ${viewedCount} viewed`
                                  : `Hide ${viewedCount} viewed`}
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            <button
                              onClick={() => { setEditingAlert(undefined); setAlertModalOpen(true); }}
                              className="flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-700 transition"
                            >
                              <FiBell className="w-3.5 h-3.5" /> Get daily alerts
                            </button>
                            <div className="flex items-center gap-2">
                              <span>Show</span>
                              <select
                                value={pageSize}
                                onChange={(e) => {
                                  const ps = Number(e.target.value) as JsearchPageSize;
                                  setPageSize(ps);
                                  setPage(1);
                                  if (searched) runSearch(lastSearchRef.current.q, lastSearchRef.current.loc, 1, ps);
                                }}
                                className="border border-slate-200 rounded-lg text-xs py-1 px-2 bg-white cursor-pointer hover:border-brand-400 transition focus:outline-none focus:ring-2 focus:ring-brand-100"
                              >
                                {JSEARCH_PAGE_SIZES.map((n) => (
                                  <option key={n} value={n}>{n} per page</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* Compact chips only below xl — the side-rail panel covers desktop */}
                        <div className="xl:hidden">
                          <MatchFilterChips jobs={jobs} minMatch={minMatch} onChange={setMinMatch} />
                        </div>

                        <div className="flex flex-col gap-3">
                          {visibleJobs.map((job) => (
                            <JobCard
                              key={job.job_id}
                              job={job}
                              saved={savedIds.has(job.job_id)}
                              seen={seenIds.has(job.job_id)}
                              isFree={isFree}
                              onSave={handleSave}
                              onUseSaved={(j) => setPickerJob(j)}
                              onApply={handleApply}
                              onApplyChoice={(j) => setApplyJob(j)}
                            />
                          ))}
                  </div>

                  {/* Google-style pagination */}
                  <div className="flex items-center justify-center gap-1 pt-2 flex-wrap">
                    <button
                      disabled={page === 1}
                      onClick={() => { const p = page - 1; setPage(p); runSearch(lastSearchRef.current.q, lastSearchRef.current.loc, p, pageSize); }}
                      className="flex items-center gap-1 px-3 h-9 rounded-full text-sm text-slate-600 hover:text-brand-600 hover:bg-brand-50 transition disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      ← Prev
                    </button>
                    {getPaginationPages(page, hasMore ? MAX_PAGES : page).map((n, i) =>
                      n === "..." ? (
                        <span key={`ellipsis-${i}`} className="w-9 h-9 flex items-center justify-center text-slate-400 text-sm select-none">
                          …
                        </span>
                      ) : (
                        <button
                          key={n}
                          onClick={() => { if (n !== page) { setPage(n); runSearch(lastSearchRef.current.q, lastSearchRef.current.loc, n, pageSize); } }}
                          className={`w-9 h-9 rounded-full text-sm font-medium transition ${
                            n === page
                              ? "bg-brand-600 text-white shadow-sm"
                              : "text-slate-600 hover:bg-brand-50 hover:text-brand-600 border border-slate-200"
                          }`}
                        >
                          {n}
                        </button>
                      )
                    )}
                    <button
                      disabled={!hasMore}
                      onClick={() => { const p = page + 1; setPage(p); runSearch(lastSearchRef.current.q, lastSearchRef.current.loc, p, pageSize); }}
                      className="flex items-center gap-1 px-3 h-9 rounded-full text-sm text-slate-600 hover:text-brand-600 hover:bg-brand-50 transition disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Next →
                    </button>
                  </div>
                      </>
                    );
                  })()}
                </>
              )}
            </>
          )}

          {/* ── Applications tab (J4 tracker) ─────────────────────────────────── */}
          {activeTab === "applications" && (
            <ApplicationTracker onTailor={handleTailor} />
          )}

          {/* ── My Alerts tab ─────────────────────────────────────────────────── */}
          {activeTab === "alerts" && (
            <div className="flex flex-col gap-4">
              {isFree ? (
                /* Free users — upsell card */
                <div className="card text-center py-14 flex flex-col items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-brand-100 flex items-center justify-center">
                    <FiBell className="w-7 h-7 text-brand-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Daily Job Alerts</h2>
                    <p className="text-slate-500 mt-1 max-w-sm mx-auto text-sm">
                      Save your searches and receive a daily email digest with new matching jobs — available on Plus and Pro.
                    </p>
                  </div>
                  <a href="/settings/plan" className="btn-primary text-sm px-6 py-2">
                    Upgrade to Plus →
                  </a>
                </div>
              ) : (
              <>
                {/* Header row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-700">
                        {tier === "plus"
                          ? `${alertCount} / ${plusAlertLimit} alerts used`
                          : `${alertCount} alert${alertCount !== 1 ? "s" : ""}`}
                      </p>
                      {atPlusLimit && (
                        <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 rounded-full px-2 py-0.5">
                          Limit reached
                        </span>
                      )}
                    </div>
                    <button
                      onClick={openCreateAlert}
                      disabled={atPlusLimit}
                      className="btn-primary text-sm gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={atPlusLimit ? "Upgrade to Pro for unlimited alerts" : "Create a new job alert"}
                    >
                      <FiPlusCircle className="w-4 h-4" /> New Alert
                    </button>
                  </div>

                  {/* Plus limit nudge */}
                  {atPlusLimit && (
                    <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                      <FiAlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                      <span className="text-amber-700">
                        You&apos;ve reached the Plus limit of {plusAlertLimit} alerts.
                        Upgrade to Pro for unlimited job alerts.
                      </span>
                    </div>
                  )}

                  {/* Alert list */}
                  {!alertsLoaded && (
                    <div className="flex flex-col gap-3">
                      {[1, 2].map((i) => (
                        <div key={i} className="card flex items-start gap-4 animate-pulse">
                          <div className="w-10 h-10 rounded-xl bg-slate-200 shrink-0" />
                          <div className="flex-1 flex flex-col gap-2">
                            <div className="h-4 bg-slate-200 rounded w-1/3" />
                            <div className="h-3 bg-slate-100 rounded w-1/4" />
                            <div className="flex gap-1.5 mt-1">
                              <div className="h-5 w-16 bg-slate-100 rounded-full" />
                              <div className="h-5 w-20 bg-slate-100 rounded-full" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {alertsLoaded && alerts.length === 0 && (
                    <div className="card text-center py-14 flex flex-col items-center gap-3 text-slate-400">
                      <FiBell className="w-8 h-8 text-slate-300" />
                      <p className="text-sm font-medium text-slate-500">No alerts yet</p>
                      <p className="text-xs">
                        Search for jobs above, then click the{" "}
                        <FiBell className="inline w-3 h-3 text-slate-400" /> button to save a search as a daily alert.
                      </p>
                    </div>
                  )}

                  {alertsLoaded && alerts.length > 0 && (
                    <div className="flex flex-col gap-3">
                      {alerts.map((alert) => (
                        <AlertCard
                          key={alert.id}
                          alert={alert}
                          onToggle={handleToggleAlert}
                          onEdit={openEditAlert}
                          onDelete={handleDeleteAlert}
                        />
                      ))}
                    </div>
                  )}
              </>
              )}
            </div>
          )}
      </div>

      <aside className="hidden xl:flex flex-col gap-4 sticky top-8">
        <ProfileCompletenessCard completeness={completeness} />
        <MatchFilterChips jobs={jobs} minMatch={minMatch} onChange={setMinMatch} variant="panel" />
      </aside>
      </div>

      <ApplyChoiceModal
        job={applyJob}
        onClose={() => setApplyJob(null)}
        onManual={handleManualApply}
      />

      <ResumePickerModal
        open={!!pickerJob}
        onClose={() => setPickerJob(null)}
        onTailorNew={() => pickerJob && handleTailor(pickerJob)}
        jobTitle={pickerJob?.job_title}
        employerName={pickerJob?.employer_name}
      />

      <CreateAlertModal
        open={alertModalOpen}
        onClose={() => setAlertModalOpen(false)}
        onSaved={handleAlertSaved}
        initialQueryTags={queryTags}
        initialLocationTags={locationTags}
        editAlert={editingAlert}
      />
    </div>
  );
}
