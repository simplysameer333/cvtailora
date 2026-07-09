"use client";

/**
 * Colour-variant swatch row for a CV template. The options come from the
 * template's own accentColor + its `accent_variants` (MongoDB data — either a
 * per-template list or the global admin-editable palette; nothing hardcoded).
 *
 * `value === null` means the template's own default accent.
 */
export default function AccentSwatches({
  base,
  variants,
  value,
  onChange,
}: {
  base: string;                     // template's default accent (#hex)
  variants: string[];               // variant options (#hex, data-driven)
  value: string | null;             // chosen variant, null = default
  onChange: (accent: string | null) => void;
}) {
  const norm = (h: string) => h.toLowerCase();
  // Default swatch first; variants minus any duplicate of the default.
  const options: { hex: string; isDefault: boolean }[] = [
    { hex: base, isDefault: true },
    ...variants.filter((v) => norm(v) !== norm(base)).map((hex) => ({ hex, isDefault: false })),
  ];
  if (options.length < 2) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap" role="radiogroup" aria-label="Accent colour">
      {options.map(({ hex, isDefault }) => {
        const selected = isDefault ? value === null : value !== null && norm(value) === norm(hex);
        return (
          <button
            key={hex}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={(e) => { e.stopPropagation(); onChange(isDefault ? null : hex); }}
            title={isDefault ? `Default (${hex})` : hex}
            className={`w-5 h-5 rounded-full border-2 transition-transform ${
              selected ? "border-slate-900 scale-110" : "border-white shadow-sm hover:scale-110"
            }`}
            style={{ backgroundColor: hex }}
          />
        );
      })}
    </div>
  );
}
