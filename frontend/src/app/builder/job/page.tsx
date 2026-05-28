"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { saveJobDescription } from "@/lib/api";
import { getSessionId } from "@/lib/session";
import { useStepGuard } from "@/lib/stepGuard";

export default function JobPage() {
  useStepGuard("job");
  const router = useRouter();
  const [jd, setJd] = useState("");

  // Pre-fill from "Tailor Resume" on the jobs page
  useEffect(() => {
    const prefill = localStorage.getItem("tailormycv_prefill_jd");
    if (prefill) {
      setJd(prefill);
      localStorage.removeItem("tailormycv_prefill_jd");
      toast.success("Job description pre-filled from your search.");
    }
  }, []);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const sessionId = getSessionId();
    if (!sessionId) { toast.error("No session — please start from Step 1."); return; }
    if (jd.trim().length < 50) { toast.error("Please paste the full job description (min 50 characters)."); return; }

    setLoading(true);
    try {
      await saveJobDescription(sessionId, jd);
      toast.success("Job description saved!");
      router.push("/builder/template");
    } catch {
      toast.error("Failed to save job description.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Paste the Job Description</h1>
      <p className="text-slate-500 mb-6">
        Copy the full job posting from LinkedIn, Indeed, or any source. The more detail, the better the tailoring.
      </p>

      <form onSubmit={handleSubmit} className="card space-y-5">
        <div>
          <label className="label">Job Description</label>
          <textarea
            className="input h-72 resize-none font-mono text-xs"
            placeholder="Paste the full job description here…"
            value={jd}
            onChange={(e) => setJd(e.target.value)}
          />
          <p className="text-xs text-slate-400 mt-1">{jd.length} characters</p>
        </div>

        <div className="flex justify-between pt-2">
          <button type="button" onClick={() => router.back()} className="btn-secondary">← Back</button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Saving…" : "Continue →"}
          </button>
        </div>
      </form>
    </div>
  );
}
