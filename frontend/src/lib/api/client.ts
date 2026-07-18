// Axios instance, auth token plumbing and global error interceptors.

import axios from "axios";
import { getSession } from "next-auth/react";
import type { CvTemplate, DocxConfig } from "@/lib/cvTemplates";

export const SESSION_KEYS = [
  "cvtailora_session_id",
  "cvtailora_generated",
  "cvtailora_eval_summary",
  "cvtailora_template_id",
  "cvtailora_output_format",
  "cvtailora_instructions",
  "cvtailora_locked_facts",
  "cvtailora_custom_sections",
  "cvtailora_tailor_context",
];

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:9000",
});

// Dev-bypass: seed a dev token at module load so the very first request (e.g. a
// hard load of /admin) is authenticated BEFORE DevProvider's effect runs — React
// fires child effects before parent effects, so without this the admin page's
// initial fetch would go out tokenless and 401. DevProvider.setApiToken() then
// overrides this whenever the tier switcher changes.
if (process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true") {
  api.defaults.headers.common["Authorization"] = "Bearer dev-pro";
}

/** Called by AuthProvider whenever the NextAuth session changes. */
export function setApiToken(token: string | null) {
  if (token) {
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common["Authorization"];
  }
}

// Fallback auth: if a request fires before AuthProvider's TokenSync has attached
// the Bearer token (e.g. the admin page's first fetch on a hard page load /
// refresh), pull the token straight from the NextAuth session so the call isn't
// sent unauthenticated — which on production 401'd and left admin tabs empty.
// Once attached, it's also written to the instance default so later calls skip
// the getSession() round-trip. Skipped entirely in dev-bypass mode.
api.interceptors.request.use(async (config) => {
  if (
    process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH !== "true" &&
    typeof window !== "undefined" &&
    !config.headers?.Authorization
  ) {
    try {
      const session = await getSession();
      const token = (session as { accessToken?: string } | null)?.accessToken;
      if (token) {
        api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
        config.headers.set("Authorization", `Bearer ${token}`);
      }
    } catch { /* ignore — request proceeds unauthenticated */ }
  }
  return config;
});

export default api;

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status: number | undefined = err?.response?.status;
    const detail: string = err?.response?.data?.detail ?? "";

    // ── Session gone (404 on session document) ────────────────────────────────
    const isSessionGone = status === 404 && detail.toLowerCase().includes("session");
    if (isSessionGone && typeof window !== "undefined") {
      SESSION_KEYS.forEach((k) => localStorage.removeItem(k));
      window.dispatchEvent(new CustomEvent("session-expired"));
    }

    // ── 401 Unauthorised — token expired / invalid ────────────────────────────
    if (status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth-error"));
      // Don't double-toast — let the component handle it via the event
      return Promise.reject(err);
    }

    // ── 5xx Server errors — show a generic toast (import lazily to avoid SSR) ─
    if (status !== undefined && status >= 500) {
      import("react-hot-toast").then(({ default: toast }) => {
        const msg = detail || "Server error — please try again in a moment.";
        toast.error(msg, { id: `server-${status}`, duration: 6000 });
      });
    }

    // ── Network / timeout errors (no response at all) ─────────────────────────
    if (!err.response && err.code !== "ERR_CANCELED") {
      import("react-hot-toast").then(({ default: toast }) => {
        toast.error("Network error — check your connection and try again.", {
          id: "network-error", duration: 6000,
        });
      });
    }

    return Promise.reject(err);
  }
);
