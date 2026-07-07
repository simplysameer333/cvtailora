import type { ComponentType, ReactNode } from "react";

/**
 * Shared page banner — emerald portal gradient, used as the header on tool pages
 * (CV Score, CV Builder, Cover Letter, Interview Prep, Find Jobs). Compact height;
 * optional `tag` renders a pill beside the title (e.g. "Free · No sign-in required").
 * Optional `children` render on the same emerald band below the subtitle — the
 * CV Builder uses this to sit its step pills on the banner.
 */
export default function PageBanner({
  icon: Icon,
  title,
  subtitle,
  tag,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  tag?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-gradient-to-r from-teal-700 to-teal-500 px-5 py-3.5 text-white">
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-white" />
        </div>
        <h1 className="text-xl font-bold leading-tight">{title}</h1>
        {tag && (
          <span className="text-[11px] font-semibold bg-white/20 rounded-full px-2.5 py-0.5">
            {tag}
          </span>
        )}
      </div>
      {subtitle && <p className="text-teal-50 text-sm mt-1">{subtitle}</p>}
      {/* Optional slot on its own line below the title — e.g. builder step pills */}
      {children && <div className="mt-1">{children}</div>}
    </div>
  );
}
