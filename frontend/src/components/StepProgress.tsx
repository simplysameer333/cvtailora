"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import Logo from "@/components/Logo";

const STEPS = [
  { label: "Upload",   href: "/builder/upload" },
  { label: "Profile",  href: "/builder/profile" },
  { label: "Job",      href: "/builder/job" },
  { label: "Template", href: "/builder/template" },
  { label: "Preview",  href: "/builder/preview" },
  { label: "Download", href: "/builder/download" },
];

export default function StepProgress() {
  const pathname = usePathname();
  const current = STEPS.findIndex((s) => pathname.startsWith(s.href));
  const progressPct = current >= 0 ? Math.round(((current + 1) / STEPS.length) * 100) : 0;

  return (
    <nav className="w-full bg-white border-b border-slate-200">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">

        {/* ── Main row — fixed 64 px tall, items vertically centred ── */}
        <div className="h-16 flex items-center justify-between gap-4">

          <Link href="/" className="shrink-0">
            <Logo />
          </Link>

          {/* Mobile: "Step N of 6 · Label" */}
          {current >= 0 && (
            <span className="sm:hidden text-xs text-slate-500 font-medium whitespace-nowrap">
              Step {current + 1} of {STEPS.length} · {STEPS[current].label}
            </span>
          )}

          {/* Desktop: step pill list */}
          <ol className="hidden sm:flex items-center gap-1 flex-1">
            {STEPS.map((step, i) => {
              const done   = i < current;
              const active = i === current;
              return (
                <li key={step.href} className="flex items-center gap-1 flex-1">
                  <div
                    className={clsx(
                      "flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full transition whitespace-nowrap",
                      active && "bg-brand-600 text-white",
                      done   && "text-brand-600",
                      !active && !done && "text-slate-400",
                    )}
                  >
                    <span
                      className={clsx(
                        "w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold border shrink-0",
                        active && "bg-white text-brand-600 border-white",
                        done   && "bg-brand-600 text-white border-brand-600",
                        !active && !done && "border-slate-300 text-slate-400",
                      )}
                    >
                      {done ? "✓" : i + 1}
                    </span>
                    {step.label}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={clsx("h-px flex-1", done ? "bg-brand-400" : "bg-slate-200")} />
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {/* Mobile: thin progress bar sits below the main row */}
        <div className="sm:hidden pb-2 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

      </div>
    </nav>
  );
}
