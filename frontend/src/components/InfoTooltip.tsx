"use client";
import { FiInfo } from "react-icons/fi";

/**
 * Compact "i" affordance for a one-line explanation — native title tooltip,
 * same lightweight pattern already used on the per-section Regenerate
 * buttons. Deliberately not a custom popover: consistency over polish, and
 * it works identically on desktop hover / keyboard focus.
 */
export default function InfoTooltip({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span
      title={text}
      tabIndex={0}
      role="img"
      aria-label={text}
      className={`inline-flex items-center justify-center w-4 h-4 rounded-full border border-slate-300 text-slate-400 hover:text-brand-600 hover:border-brand-300 cursor-help shrink-0 ${className}`}
    >
      <FiInfo className="w-2.5 h-2.5" />
    </span>
  );
}
