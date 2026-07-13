/** Shared date/time rendering for backend timestamps.
 *
 * The backend stores and serves UTC (usually as naive ISO strings, no "Z").
 * Rendering in each viewer's local timezone made the same timestamp read
 * differently across the app (and naive strings were being parsed as local,
 * shifting values). So the whole app renders timestamps in ONE configured
 * timezone with an explicit label.
 *
 * The zone is NOT hardcoded — it comes from the centralized app config
 * (system_config.display_timezone, served by GET /api/config/app) and is set
 * here once at startup via setDisplayTimezone(). Default "UTC" until loaded.
 */

let _displayTz = "UTC";

/** Set the app-wide display timezone (IANA name). Called once at startup from
 *  the fetched app config; falls back to "UTC" for empty/invalid input. */
export function setDisplayTimezone(tz?: string | null): void {
  _displayTz = tz && tz.trim() ? tz.trim() : "UTC";
}

/** The timezone currently used for all timestamp rendering. */
export function displayTimezone(): string {
  return _displayTz;
}

/** Parse a backend UTC timestamp (ISO with or without trailing Z) as UTC. */
export function parseUtc(iso: string): Date {
  return new Date(/Z|[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + "Z");
}

/** "12 Jul 2026, 21:03 UTC" — date + time in the configured display timezone,
 *  with an explicit zone label so it's never ambiguous. */
export function formatDateTimeUtc(
  iso: string | null,
  opts?: Intl.DateTimeFormatOptions,
): string {
  if (!iso) return "—";
  return parseUtc(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: _displayTz, timeZoneName: "short",
    ...opts,
  });
}

/** "12 Jul 2026" — date only in the configured display timezone (so the day
 *  never shifts under the viewer's local offset). */
export function formatDateUtc(
  iso: string | null,
  opts?: Intl.DateTimeFormatOptions,
): string {
  if (!iso) return "—";
  return parseUtc(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    timeZone: _displayTz,
    ...opts,
  });
}
