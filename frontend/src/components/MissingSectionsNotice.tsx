"use client";

import { FiAlertTriangle } from "react-icons/fi";
import type { PreviewData } from "@/lib/cvTemplates";

/** Core resume sections the template previews expect. Pure — returns the
 *  human-readable names of sections absent from the extracted profile. */
export function missingSections(d: PreviewData): string[] {
  const missing: string[] = [];
  if (!d.email?.trim() && !d.phone?.trim()) missing.push("Contact details");
  if (!d.summary?.trim())      missing.push("Professional summary");
  if (!d.skills?.length)       missing.push("Skills");
  if (!d.experience?.length)   missing.push("Work experience");
  if (!d.education?.length)    missing.push("Education");
  return missing;
}

/**
 * Shown above the template previews when the extractor found no content for
 * core sections — instead of silently rendering half-empty templates, tell
 * the user what's missing and what to do about it.
 */
export default function MissingSectionsNotice({ data }: { data: PreviewData }) {
  const missing = missingSections(data);
  if (missing.length === 0) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <FiAlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      <div className="text-sm">
        <p className="font-semibold text-amber-800">
          We couldn&apos;t find {missing.length === 1 ? "a section" : "some sections"} in your CV:{" "}
          {missing.join(", ")}
        </p>
        <p className="text-xs text-amber-700 mt-1">
          The previews below only show what we could read. If your CV does include{" "}
          {missing.length === 1 ? "this section" : "these sections"}, they may be inside images or
          unusual formatting — consider a text-based layout. Otherwise, adding them will make every
          template (and your score) stronger.
        </p>
      </div>
    </div>
  );
}
