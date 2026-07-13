"use client";
import { useEffect, useState } from "react";
import { fetchSystemConfig, updateSystemConfig, type SystemConfig } from "@/lib/api";
import { FiBell, FiToggleLeft, FiToggleRight, FiClock } from "react-icons/fi";
import AccentPaletteCard from "./AccentPaletteCard";
import { setDisplayTimezone } from "@/lib/datetime";
import { Spinner } from "./shared";

// IANA timezone names for the display-timezone selector. Uses the browser's
// full list when available (Intl.supportedValuesOf), else a small curated
// fallback — the backend validates the final choice regardless.
function _timezoneOptions(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  if (typeof intl.supportedValuesOf === "function") {
    try {
      const all = intl.supportedValuesOf("timeZone");
      return all.includes("UTC") ? all : ["UTC", ...all];
    } catch { /* fall through */ }
  }
  return [
    "UTC", "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Kolkata",
    "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney",
    "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  ];
}

// ── System tab (global master switches) ────────────────────────────────────────

function SystemTab() {
  const [cfg, setCfg] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetchSystemConfig().then(setCfg).catch(() => {}).finally(() => setLoading(false));
  }, []);
  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(""), 2500); }

  async function toggleAlerts() {
    if (!cfg) return;
    const next = !cfg.alerts_enabled;
    setSaving(true);
    try {
      setCfg(await updateSystemConfig({ alerts_enabled: next }));
      flash(next ? "Alerts resumed" : "Alerts paused");
    } catch { flash("Failed"); }
    finally { setSaving(false); }
  }

  async function changeTimezone(tz: string) {
    if (!cfg || tz === cfg.display_timezone) return;
    setSaving(true);
    try {
      const updated = await updateSystemConfig({ display_timezone: tz });
      setCfg(updated);
      setDisplayTimezone(updated.display_timezone);  // apply app-wide immediately
      flash("Timezone updated");
    } catch { flash("Failed"); }
    finally { setSaving(false); }
  }

  if (loading) return <Spinner text="Loading system settings…" />;
  if (!cfg) return <div className="py-16 text-center text-slate-400">Could not load system settings.</div>;

  const on = cfg.alerts_enabled;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">App-wide master switches — these apply to every user.</p>
      <div className="card">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className={`mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center ${on ? "bg-teal-50 text-teal-600" : "bg-slate-100 text-slate-400"}`}>
              <FiBell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Daily Job Alerts</h3>
              <p className="text-sm text-slate-500 mt-0.5 max-w-xl">
                Master switch for the daily alert scheduler. When off, the daily run is skipped and
                <span className="font-medium text-slate-600"> no alert emails are sent to any user</span>.
                Individual users&apos; alerts are left untouched and resume when you switch this back on.
              </p>
              <p className="text-xs text-slate-400 mt-1.5">
                Status: <span className={on ? "text-teal-600 font-semibold" : "text-amber-600 font-semibold"}>{on ? "Active" : "Paused"}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {msg && <span className={`text-xs font-medium ${msg.includes("Failed") ? "text-red-600" : "text-green-600"}`}>{msg}</span>}
            <button onClick={toggleAlerts} disabled={saving} title={on ? "Pause all alerts" : "Resume alerts"} className="disabled:opacity-50">
              {on ? <FiToggleRight className="w-9 h-9 text-teal-600" /> : <FiToggleLeft className="w-9 h-9 text-slate-300" />}
            </button>
          </div>
        </div>
      </div>

      {/* Display timezone — single source of truth for rendering stored-UTC
          timestamps across the whole app (no zone hardcoded anywhere). */}
      <div className="card">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center bg-slate-100 text-slate-500">
            <FiClock className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-900">Display Timezone</h3>
            <p className="text-sm text-slate-500 mt-0.5 max-w-xl">
              All dates and times across the app render in this timezone (data is
              stored in UTC). Applies to every user.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <select
                value={cfg.display_timezone}
                disabled={saving}
                onChange={(e) => changeTimezone(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-50"
              >
                {_timezoneOptions().map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
              <span className="text-xs text-slate-400">Current: {cfg.display_timezone}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Global template colour palette — data-driven variants (no hardcoding) */}
      <AccentPaletteCard cfg={cfg} onSaved={setCfg} />
    </div>
  );
}

export default SystemTab;
