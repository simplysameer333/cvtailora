"use client";
import Link from "next/link";
import { FiCheck, FiAlertCircle, FiArrowRight, FiUser } from "react-icons/fi";
import type { ProfileCompleteness } from "@/lib/api";

/** Compact completeness card for side panels (Jobs). The Profile page has its own richer version. */
export default function ProfileCompletenessCard({
  completeness,
}: {
  completeness: ProfileCompleteness | null;
}) {
  if (!completeness) {
    return (
      <div className="card">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-2">
          <FiUser className="w-4 h-4" /> Profile
        </h3>
        <p className="text-sm text-slate-500">
          Set up your profile to pre-fill searches and tailor resumes in one click.
        </p>
        <Link href="/profile" className="btn-accent w-full justify-center text-sm mt-3">
          Set up Profile <FiArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  const { percent, checklist } = completeness;
  const missing = checklist.filter((i) => !i.complete);
  const done = checklist.filter((i) => i.complete);
  const color = percent >= 80 ? "text-teal-600" : percent >= 50 ? "text-amber-500" : "text-red-500";
  const bar = percent >= 80 ? "bg-teal-500" : percent >= 50 ? "bg-amber-400" : "bg-red-400";

  return (
    <div className="card !p-6">
      <h3 className="font-semibold text-slate-800 text-base mb-4">Profile Completeness</h3>
      <div className="flex items-center gap-4 mb-3">
        <span className={`text-5xl font-bold ${color}`}>{percent}%</span>
        <div className="flex-1">
          <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div className={`h-full rounded-full ${bar} transition-all`} style={{ width: `${percent}%` }} />
          </div>
          <p className="text-xs text-slate-400 mt-2">
            {percent === 100
              ? "Complete and ready for one-click tailoring. 🎉"
              : "A stronger profile means better-tailored resumes."}
          </p>
        </div>
      </div>
      {/* Full checklist — missing items first */}
      <div className="flex flex-col gap-1.5 pt-3 border-t border-slate-100">
        {missing.map(({ key, label }) => (
          <span key={key} className="flex items-center gap-2.5 text-sm text-amber-700 py-0.5">
            <FiAlertCircle className="w-4 h-4 text-amber-500 shrink-0" /> {label}
          </span>
        ))}
        {done.map(({ key, label }) => (
          <span key={key} className="flex items-center gap-2.5 text-sm text-slate-400 py-0.5">
            <FiCheck className="w-4 h-4 text-teal-500 shrink-0" /> {label}
          </span>
        ))}
      </div>
      {percent < 100 && (
        <Link href="/profile" className="btn-accent w-full justify-center text-sm mt-4">
          Improve Profile <FiArrowRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}
