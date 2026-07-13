"use client";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { adminUpdateTierConfig, fetchTierConfig, type TierConfigPayload } from "@/lib/api";
import {
  FiSave, FiAlertCircle, FiPlus, FiX, FiChevronUp, FiChevronDown,
} from "react-icons/fi";

// ── TierConfigTab ──────────────────────────────────────────────────────────────

const ALL_TIERS = ["free", "plus", "pro"] as const;

function TierConfigTab() {
  const [cfg, setCfg] = useState<TierConfigPayload | null>(null);
  const [draft, setDraft] = useState<TierConfigPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    fetchTierConfig().then(data => { setCfg(data); setDraft(data); }).catch(() => {});
  }, []);

  if (!draft) return <div className="text-sm text-slate-400 py-8 text-center">Loading tier config…</div>;

  const dirty = JSON.stringify(draft) !== JSON.stringify(cfg);

  function toggleFeatureTier(feature: string, tier: string) {
    setDraft(prev => {
      if (!prev) return prev;
      const current = prev.features[feature] ?? [];
      const updated = current.includes(tier)
        ? current.filter(t => t !== tier)
        : [...current, tier];
      return { ...prev, features: { ...prev.features, [feature]: updated } };
    });
  }

  // null = unlimited. Accept easy-to-type values for unlimited so admins never
  // need the ∞ character: blank, "unlimited"/"unlim"/"inf"/"infinity"/"u", "-1", "*".
  const _UNLIMITED_WORDS = new Set(["", "∞", "unlimited", "unlim", "inf", "infinity", "u", "-1", "*"]);
  function setLimit(limitKey: string, tier: string, value: string) {
    setDraft(prev => {
      if (!prev) return prev;
      const v = value.trim().toLowerCase();
      const parsed = _UNLIMITED_WORDS.has(v) ? null : parseInt(value, 10);
      return {
        ...prev,
        limits: {
          ...prev.limits,
          [limitKey]: { ...(prev.limits[limitKey] ?? {}), [tier]: isNaN(parsed as number) ? null : parsed },
        },
      };
    });
  }

  // ── Pricing helpers ─────────────────────────────────────────────────────────

  function setPricingField(code: string, field: "symbol" | "plus" | "pro", value: string) {
    setDraft(prev => {
      if (!prev) return prev;
      const pricing = { ...(prev.pricing ?? {}) };
      pricing[code] = {
        ...(pricing[code] ?? { symbol: "", plus: 0, pro: 0 }),
        [field]: field === "symbol" ? value : (parseInt(value, 10) || 0),
      };
      return { ...prev, pricing };
    });
  }

  function addCurrency() {
    setDraft(prev => {
      if (!prev) return prev;
      const pricing = { ...(prev.pricing ?? {}) };
      const code = `CUR${Object.keys(pricing).length + 1}`;
      pricing[code] = { symbol: "", plus: 0, pro: 0 };
      return { ...prev, pricing };
    });
  }

  function renameCurrency(oldCode: string, newCode: string) {
    setDraft(prev => {
      if (!prev || !newCode.trim() || oldCode === newCode.trim()) return prev;
      const pricing = { ...(prev.pricing ?? {}) };
      const entry = pricing[oldCode];
      delete pricing[oldCode];
      pricing[newCode.trim().toUpperCase()] = entry;
      // Update any currency_zones referencing old code
      const zones = (prev.currency_zones ?? []).map(z =>
        z.currency === oldCode ? { ...z, currency: newCode.trim().toUpperCase() } : z
      );
      return { ...prev, pricing, currency_zones: zones };
    });
  }

  function removeCurrency(code: string) {
    setDraft(prev => {
      if (!prev) return prev;
      const pricing = { ...(prev.pricing ?? {}) };
      delete pricing[code];
      return { ...prev, pricing };
    });
  }

  // ── Currency zone helpers ────────────────────────────────────────────────────

  function setZoneField(idx: number, field: keyof import("@/lib/api").CurrencyZone, value: string | string[]) {
    setDraft(prev => {
      if (!prev) return prev;
      const zones = [...(prev.currency_zones ?? [])];
      zones[idx] = { ...zones[idx], [field]: value };
      return { ...prev, currency_zones: zones };
    });
  }

  function addZone() {
    setDraft(prev => {
      if (!prev) return prev;
      const firstCurrency = Object.keys(prev.pricing ?? {})[0] ?? "USD";
      return {
        ...prev,
        currency_zones: [...(prev.currency_zones ?? []), {
          currency: firstCurrency, timezones: [], timezone_prefix: "", locale_codes: [],
        }],
      };
    });
  }

  function removeZone(idx: number) {
    setDraft(prev => {
      if (!prev) return prev;
      const zones = [...(prev.currency_zones ?? [])];
      zones.splice(idx, 1);
      return { ...prev, currency_zones: zones };
    });
  }

  function moveZone(idx: number, dir: -1 | 1) {
    setDraft(prev => {
      if (!prev) return prev;
      const zones = [...(prev.currency_zones ?? [])];
      const target = idx + dir;
      if (target < 0 || target >= zones.length) return prev;
      [zones[idx], zones[target]] = [zones[target], zones[idx]];
      return { ...prev, currency_zones: zones };
    });
  }

  function addTagToZone(idx: number, field: "timezones" | "locale_codes", val: string) {
    if (!val.trim()) return;
    setDraft(prev => {
      if (!prev) return prev;
      const zones = [...(prev.currency_zones ?? [])];
      const existing = zones[idx][field] ?? [];
      if (existing.includes(val.trim())) return prev;
      zones[idx] = { ...zones[idx], [field]: [...existing, val.trim()] };
      return { ...prev, currency_zones: zones };
    });
  }

  function removeTagFromZone(idx: number, field: "timezones" | "locale_codes", val: string) {
    setDraft(prev => {
      if (!prev) return prev;
      const zones = [...(prev.currency_zones ?? [])];
      zones[idx] = { ...zones[idx], [field]: (zones[idx][field] ?? []).filter((t: string) => t !== val) };
      return { ...prev, currency_zones: zones };
    });
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setErrors([]);
    try {
      const result = await adminUpdateTierConfig({
        features: draft.features,
        limits: draft.limits,
        pricing: draft.pricing,
        currency_zones: draft.currency_zones,
      });
      setCfg(result);
      setDraft(result);
      toast.success("Tier config saved and reloaded.");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: { errors?: string[] } | string } } })?.response?.data?.detail;
      if (detail && typeof detail === "object" && detail.errors) {
        setErrors(detail.errors);
      } else {
        toast.error("Save failed — check the console for details.");
      }
    } finally { setSaving(false); }
  }

  const featureLabels = draft.feature_labels ?? {};
  const limitLabels   = draft.limit_labels   ?? {};
  const pricingEntries = Object.entries(draft.pricing ?? {});
  const currencyZones  = draft.currency_zones ?? [];
  const currencyCodes  = Object.keys(draft.pricing ?? {});

  return (
    <div className="space-y-8">
      {/* Validation errors */}
      {errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-red-700 flex items-center gap-2">
            <FiAlertCircle className="w-4 h-4" /> Config has contradictions — fix before saving:
          </p>
          {errors.map((e, i) => <p key={i} className="text-xs text-red-600 pl-6">{e}</p>)}
        </div>
      )}

      {/* ── Feature gates ───────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Feature Gates</h3>
            <p className="text-xs text-slate-400 mt-0.5">Check which tiers can use each feature. Higher tiers must always include features available on lower ones.</p>
          </div>
          {dirty && (
            <button onClick={handleSave} disabled={saving}
              className="btn-primary text-sm gap-1.5 flex items-center disabled:opacity-40">
              <FiSave className="w-3.5 h-3.5" />
              {saving ? "Saving…" : "Save changes"}
            </button>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-2.5 w-full">Feature</th>
                {ALL_TIERS.map(t => (
                  <th key={t} className="text-center text-xs font-semibold text-slate-500 px-4 py-2.5 capitalize min-w-[70px]">{t}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.keys(draft.features).map(feat => (
                <tr key={feat} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-2.5 text-slate-700 text-xs font-medium">
                    {featureLabels[feat] ?? feat}
                    <span className="ml-2 text-slate-300 font-normal">{feat}</span>
                  </td>
                  {ALL_TIERS.map(tier => (
                    <td key={tier} className="px-4 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={(draft.features[feat] ?? []).includes(tier)}
                        onChange={() => toggleFeatureTier(feat, tier)}
                        className="w-4 h-4 accent-brand-600 cursor-pointer"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Limits ──────────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-1">Numeric Limits</h3>
        <p className="text-xs text-slate-400 mb-3">For unlimited: leave the box blank, type <span className="font-mono">unlimited</span> or <span className="font-mono">-1</span>, or click the <span className="font-semibold">∞</span> button. Type a number otherwise. Limits must be non-decreasing across tiers.</p>
        <div className="rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-2.5 w-full">Limit</th>
                {ALL_TIERS.map(t => (
                  <th key={t} className="text-center text-xs font-semibold text-slate-500 px-4 py-2.5 capitalize min-w-[90px]">{t}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.keys(draft.limits).map(limitKey => (
                <tr key={limitKey} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-2.5 text-slate-700 text-xs font-medium">
                    {limitLabels[limitKey] ?? limitKey}
                    <span className="ml-2 text-slate-300 font-normal">{limitKey}</span>
                  </td>
                  {ALL_TIERS.map(tier => {
                    const val = draft.limits[limitKey]?.[tier];
                    const isUnlimited = val === null;
                    return (
                      <td key={tier} className="px-4 py-2.5 text-center">
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={val === null || val === undefined ? "" : String(val)}
                            onChange={e => setLimit(limitKey, tier, e.target.value)}
                            className="w-16 text-center border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-300"
                            placeholder="∞"
                            title="Type a number, or leave blank / type 'unlimited' for unlimited"
                          />
                          <button
                            type="button"
                            onClick={() => setLimit(limitKey, tier, "∞")}
                            title={isUnlimited ? "Unlimited" : "Set unlimited"}
                            className={`text-base leading-none px-1 rounded transition ${
                              isUnlimited ? "text-brand-600 font-bold" : "text-slate-300 hover:text-brand-500"
                            }`}
                          >
                            ∞
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Pricing</h3>
            <p className="text-xs text-slate-400 mt-0.5">Set Plus and Pro prices per currency. Free is always shown as free. Currency is auto-detected from the user&apos;s timezone/locale.</p>
          </div>
          <button onClick={addCurrency} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 border border-brand-200 hover:border-brand-400 rounded-lg px-2.5 py-1.5 transition">
            <FiPlus className="w-3 h-3" /> Add currency
          </button>
        </div>
        <div className="rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-2.5">Code</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-2.5">Symbol</th>
                <th className="text-center text-xs font-semibold text-slate-500 px-4 py-2.5">Plus / mo</th>
                <th className="text-center text-xs font-semibold text-slate-500 px-4 py-2.5">Pro / mo</th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pricingEntries.map(([code, entry], idx) => (
                <tr key={code} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      defaultValue={code}
                      onBlur={e => renameCurrency(code, e.target.value)}
                      className="w-16 border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono uppercase focus:outline-none focus:ring-2 focus:ring-brand-300"
                      maxLength={5}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={entry.symbol}
                      onChange={e => setPricingField(code, "symbol", e.target.value)}
                      className="w-12 text-center border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-300"
                      maxLength={3}
                      placeholder="$"
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="number"
                      value={entry.plus}
                      onChange={e => setPricingField(code, "plus", e.target.value)}
                      className="w-16 text-center border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-300"
                      min={0}
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="number"
                      value={entry.pro}
                      onChange={e => setPricingField(code, "pro", e.target.value)}
                      className="w-16 text-center border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-300"
                      min={0}
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    {idx > 0 && (
                      <button onClick={() => removeCurrency(code)} className="text-slate-300 hover:text-red-400 transition p-1">
                        <FiX className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400 mt-1.5">First row is the default currency (fallback when no zone rule matches). Cannot be deleted.</p>
      </div>

      {/* ── Currency detection rules ─────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Currency Detection Rules</h3>
            <p className="text-xs text-slate-400 mt-0.5">Ordered — first matching rule wins. Users with no match get the default (first) currency.</p>
          </div>
          <button onClick={addZone} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 border border-brand-200 hover:border-brand-400 rounded-lg px-2.5 py-1.5 transition">
            <FiPlus className="w-3 h-3" /> Add rule
          </button>
        </div>
        <div className="space-y-3">
          {currencyZones.length === 0 && (
            <p className="text-xs text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-xl">No rules — all users will see the default currency.</p>
          )}
          {currencyZones.map((zone, idx) => (
            <ZoneCard
              key={idx}
              zone={zone}
              idx={idx}
              total={currencyZones.length}
              currencyCodes={currencyCodes}
              onCurrencyChange={c => setZoneField(idx, "currency", c)}
              onPrefixChange={p => setZoneField(idx, "timezone_prefix", p)}
              onAddTimezone={v => addTagToZone(idx, "timezones", v)}
              onRemoveTimezone={v => removeTagFromZone(idx, "timezones", v)}
              onAddLocale={v => addTagToZone(idx, "locale_codes", v)}
              onRemoveLocale={v => removeTagFromZone(idx, "locale_codes", v)}
              onMoveUp={() => moveZone(idx, -1)}
              onMoveDown={() => moveZone(idx, 1)}
              onRemove={() => removeZone(idx)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── ZoneCard ──────────────────────────────────────────────────────────────────

function ZoneCard({
  zone, idx, total, currencyCodes,
  onCurrencyChange, onPrefixChange,
  onAddTimezone, onRemoveTimezone,
  onAddLocale, onRemoveLocale,
  onMoveUp, onMoveDown, onRemove,
}: {
  zone: import("@/lib/api").CurrencyZone;
  idx: number; total: number; currencyCodes: string[];
  onCurrencyChange: (v: string) => void;
  onPrefixChange: (v: string) => void;
  onAddTimezone: (v: string) => void;
  onRemoveTimezone: (v: string) => void;
  onAddLocale: (v: string) => void;
  onRemoveLocale: (v: string) => void;
  onMoveUp: () => void; onMoveDown: () => void; onRemove: () => void;
}) {
  const [tzInput, setTzInput] = useState("");
  const [locInput, setLocInput] = useState("");

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-slate-400 w-5 shrink-0 text-center">#{idx + 1}</span>
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs text-slate-500 shrink-0">Currency:</span>
          <select
            value={zone.currency}
            onChange={e => onCurrencyChange(e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            {currencyCodes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={onMoveUp} disabled={idx === 0} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30">
            <FiChevronUp className="w-3.5 h-3.5" />
          </button>
          <button onClick={onMoveDown} disabled={idx === total - 1} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30">
            <FiChevronDown className="w-3.5 h-3.5" />
          </button>
          <button onClick={onRemove} className="p-1 text-slate-300 hover:text-red-400 transition">
            <FiX className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Timezone prefix */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 w-32 shrink-0">Timezone prefix:</span>
        <input
          type="text"
          value={zone.timezone_prefix}
          onChange={e => onPrefixChange(e.target.value)}
          placeholder="e.g. Europe/"
          className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
        />
        <span className="text-xs text-slate-400">matches any timezone starting with this</span>
      </div>

      {/* Exact timezones */}
      <div className="space-y-1.5">
        <span className="text-xs text-slate-500">Exact timezones:</span>
        <div className="flex flex-wrap gap-1.5">
          {zone.timezones.map(tz => (
            <span key={tz} className="flex items-center gap-1 bg-white border border-slate-200 text-xs rounded-full px-2 py-0.5 text-slate-700">
              {tz}
              <button onClick={() => onRemoveTimezone(tz)} className="text-slate-300 hover:text-red-400 ml-0.5">
                <FiX className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={tzInput}
              onChange={e => setTzInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { onAddTimezone(tzInput); setTzInput(""); } }}
              placeholder="Europe/London"
              className="border border-slate-200 rounded-full px-2 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-brand-300 w-36"
            />
            <button onClick={() => { onAddTimezone(tzInput); setTzInput(""); }} className="text-xs text-brand-600 hover:text-brand-700 font-medium">+ Add</button>
          </div>
        </div>
      </div>

      {/* Locale codes */}
      <div className="space-y-1.5">
        <span className="text-xs text-slate-500">Locale / country codes:</span>
        <div className="flex flex-wrap gap-1.5">
          {zone.locale_codes.map(lc => (
            <span key={lc} className="flex items-center gap-1 bg-white border border-slate-200 text-xs rounded-full px-2 py-0.5 text-slate-700">
              {lc}
              <button onClick={() => onRemoveLocale(lc)} className="text-slate-300 hover:text-red-400 ml-0.5">
                <FiX className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={locInput}
              onChange={e => setLocInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { onAddLocale(locInput); setLocInput(""); } }}
              placeholder="en-GB"
              className="border border-slate-200 rounded-full px-2 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-brand-300 w-24"
            />
            <button onClick={() => { onAddLocale(locInput); setLocInput(""); }} className="text-xs text-brand-600 hover:text-brand-700 font-medium">+ Add</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TierConfigTab;
