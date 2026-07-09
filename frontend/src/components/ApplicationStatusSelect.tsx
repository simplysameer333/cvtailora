"use client";

import type { ApplicationStatus } from "@/lib/api";

/** Ordered options shown in the dropdown, with their colour treatment. */
export const STATUS_META: Record<ApplicationStatus, { label: string; badge: string; dot: string }> = {
  saved:     { label: "Saved",     badge: "text-slate-600 bg-slate-100 border-slate-200",   dot: "bg-slate-400" },
  applied:   { label: "Applied",   badge: "text-brand-700 bg-brand-50 border-brand-200",     dot: "bg-brand-500" },
  interview: { label: "Interview", badge: "text-amber-700 bg-amber-50 border-amber-200",     dot: "bg-amber-500" },
  offer:     { label: "Offer",     badge: "text-emerald-700 bg-emerald-50 border-emerald-200", dot: "bg-emerald-500" },
  rejected:  { label: "Rejected",  badge: "text-rose-600 bg-rose-50 border-rose-200",         dot: "bg-rose-400" },
};

const ORDER: ApplicationStatus[] = ["saved", "applied", "interview", "offer", "rejected"];

/**
 * Inline status changer for a tracked application (J4). A styled native
 * <select> so it stays keyboard/mobile-friendly; the coloured dot + border
 * reflect the current stage at a glance.
 */
export default function ApplicationStatusSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: ApplicationStatus;
  onChange: (status: ApplicationStatus) => void;
  disabled?: boolean;
}) {
  const meta = STATUS_META[value];
  return (
    <div className={`relative inline-flex items-center rounded-full border pl-2.5 pr-1 py-0.5 ${meta.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${meta.dot}`} />
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as ApplicationStatus)}
        className="appearance-none bg-transparent text-xs font-semibold pr-4 focus:outline-none cursor-pointer disabled:cursor-not-allowed"
        aria-label="Application status"
      >
        {ORDER.map((s) => (
          <option key={s} value={s}>{STATUS_META[s].label}</option>
        ))}
      </select>
      <svg className="w-3 h-3 absolute right-1.5 pointer-events-none opacity-60" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
      </svg>
    </div>
  );
}
