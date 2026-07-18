const KEY = "cvtailora_session_id";
const TAILOR_KEY = "cvtailora_tailor_context";

export function getSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY);
}

export function setSessionId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, id);
  // Bind a freshly-set (unbound) job/tailor context to THIS session. The
  // Find-Jobs "tailor" flow writes the context (no session_id) then creates a
  // session here; binding it to the new id — and never re-binding an already
  // bound one — stops an old job leaking into a later builder workflow (the
  // JobContextBanner only shows a context whose session_id matches the current).
  try {
    const raw = localStorage.getItem(TAILOR_KEY);
    if (raw) {
      const ctx = JSON.parse(raw);
      if (ctx && typeof ctx === "object" && !ctx.session_id) {
        ctx.session_id = id;
        localStorage.setItem(TAILOR_KEY, JSON.stringify(ctx));
      }
    }
  } catch { /* ignore corrupt data */ }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
