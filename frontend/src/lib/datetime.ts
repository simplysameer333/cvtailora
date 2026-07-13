/** Shared date/time rendering for backend timestamps.
 *
 * The backend stores and serves UTC, usually as naive ISO strings (no "Z").
 * JavaScript parses those as LOCAL time, silently shifting every timestamp by
 * the viewer's offset — so always parse through parseUtc. Admin/date-time
 * displays also show the viewer's timezone label (user request 2026-07-12) so
 * two admins in different zones can't misread the same run time.
 */

/** Parse a backend UTC timestamp (ISO with or without trailing Z) as UTC. */
export function parseUtc(iso: string): Date {
  return new Date(/Z|[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + "Z");
}

/** "12 Jul 2026, 21:03 GMT+1" — local time with an explicit timezone label. */
export function formatDateTimeLocal(
  iso: string | null,
  opts?: Intl.DateTimeFormatOptions,
): string {
  if (!iso) return "—";
  return parseUtc(iso).toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
    ...opts,
  });
}
