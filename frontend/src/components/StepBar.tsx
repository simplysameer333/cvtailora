"use client";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const STEPS = [
  { label: "Upload",   href: "/builder/upload" },
  { label: "Profile",  href: "/builder/profile" },
  { label: "Job",      href: "/builder/job" },
  { label: "Preview",  href: "/builder/preview" },
  { label: "Template", href: "/builder/template" },
];

export default function StepBar() {
  const pathname = usePathname();
  const current = STEPS.findIndex((s) => pathname.startsWith(s.href));
  const progressPct = current >= 0 ? Math.round(((current + 1) / STEPS.length) * 100) : 0;

  return (
    // Transparent — sits on the emerald PageBanner band (see builder/layout.tsx)
    <div className="w-full">

      {/* Desktop step pills */}
      <ol className="hidden sm:flex items-center gap-1">
        {STEPS.map((step, i) => {
          const done   = i < current;
          const active = i === current;
          return (
            <li key={step.href} className="flex items-center gap-1 flex-1">
              <div
                className={clsx(
                  "flex items-center gap-1.5 text-xs font-semibold px-3 py-0.5 rounded-lg transition whitespace-nowrap",
                  active && "bg-white text-teal-700 shadow-sm",
                  done   && "text-white",
                  !active && !done && "text-teal-100/70",
                )}
              >
                <span
                  className={clsx(
                    "w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                    active && "bg-teal-600 text-white",
                    done   && "bg-white/25 text-white",
                    !active && !done && "bg-white/15 text-teal-50",
                  )}
                >
                  {done ? "✓" : i + 1}
                </span>
                {step.label}
              </div>
              {i < STEPS.length - 1 && (
                <div className={clsx("h-px flex-1 mx-1", done ? "bg-white/50" : "bg-white/20")} />
              )}
            </li>
          );
        })}
      </ol>

      {/* Mobile: label + progress bar */}
      <div className="sm:hidden flex items-center justify-between py-1 text-xs text-teal-50 font-medium">
        {current >= 0 && (
          <span>Step {current + 1} of {STEPS.length} · <span className="text-white font-semibold">{STEPS[current].label}</span></span>
        )}
        <span className="text-teal-100/80">{progressPct}%</span>
      </div>
      <div className="sm:hidden h-1 w-full bg-white/20 rounded-full overflow-hidden mt-1.5">
        <div
          className="h-full bg-white rounded-full transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

    </div>
  );
}
