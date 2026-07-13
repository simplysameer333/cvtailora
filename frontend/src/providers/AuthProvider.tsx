"use client";
import { SessionProvider, useSession, signOut } from "next-auth/react";
import { useEffect, useRef } from "react";
import { setApiToken, fetchTierConfig, fetchAppConfig } from "@/lib/api";
import { setTierConfig } from "@/lib/tierConfig";
import { setDisplayTimezone } from "@/lib/datetime";
import DevProvider from "./DevProvider";

const DEV = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";

// Keys that are tier-sensitive: generated resume, eval results, locked facts.
// Cleared when session tier changes so stale Pro content doesn't linger.
const TIER_SENSITIVE_KEYS = [
  "cvtailora_generated",
  "cvtailora_eval_summary",
  "cvtailora_locked_facts",
  "cvtailora_custom_sections",
];

// Fetch tier config from MongoDB at app startup — populates the runtime store so
// hasFeature()/getTierLimit()/getPricing() reflect the live database config. Runs
// in BOTH real-auth and dev-bypass modes (the endpoint is public), otherwise dev
// mode would be stuck on the hardcoded pre-load fallback prices/limits.
function TierConfigLoader() {
  useEffect(() => {
    fetchTierConfig()
      .then((cfg) => setTierConfig(cfg.features, cfg.limits, cfg.pricing, cfg.currency_zones))
      .catch(() => { /* keep hardcoded defaults on network failure */ });
    // App-wide display timezone — single source of truth for rendering
    // stored-UTC timestamps (falls back to "UTC" on failure).
    fetchAppConfig()
      .then((cfg) => setDisplayTimezone(cfg.display_timezone))
      .catch(() => { /* datetime.ts already defaults to UTC */ });
  }, []);
  return null;
}

function TokenSync() {
  const { data: session } = useSession();
  const prevTierRef = useRef<string | null>(null);
  const signedOutRef = useRef(false);

  // Sync Bearer token on session change
  useEffect(() => {
    setApiToken(session?.accessToken ?? null);
  }, [session?.accessToken]);

  // Clear tier-sensitive localStorage when tier changes mid-session.
  // Prevents a downgraded user from retaining a Pro-tier generated resume or
  // locked facts that the generator would otherwise silently re-use.
  useEffect(() => {
    const newTier = session?.user?.tier ?? null;
    if (!newTier) return;
    const prev = prevTierRef.current;
    if (prev !== null && prev !== newTier) {
      TIER_SENSITIVE_KEYS.forEach((k) => localStorage.removeItem(k));
    }
    prevTierRef.current = newTier;
  }, [session?.user?.tier]);

  // Gracefully recover from an expired/invalid token. The API interceptor fires an
  // "auth-error" event on every 401 ("Invalid or expired token"), but nothing was
  // listening — so the user was stranded. Here we sign them out and send them to
  // re-login to mint a fresh token. (Dev-bypass uses DevProvider, so this never runs there.)
  useEffect(() => {
    function onAuthError() {
      if (signedOutRef.current) return;   // one sign-out per burst of 401s
      signedOutRef.current = true;
      import("react-hot-toast").then(({ default: toast }) =>
        toast.error("Your session expired — please sign in again.", { id: "auth-expired", duration: 5000 }),
      );
      signOut({ callbackUrl: "/auth/login" });
    }
    function onSessionExpired() {
      import("react-hot-toast").then(({ default: toast }) =>
        toast("Your builder session expired — please start again.", { id: "session-expired", duration: 5000 }),
      );
    }
    window.addEventListener("auth-error", onAuthError);
    window.addEventListener("session-expired", onSessionExpired);
    return () => {
      window.removeEventListener("auth-error", onAuthError);
      window.removeEventListener("session-expired", onSessionExpired);
    };
  }, []);

  return null;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  if (DEV) {
    // Dev bypass: no NextAuth cookie dance, no Google OAuth required.
    return (
      <DevProvider>
        <TierConfigLoader />
        {children}
      </DevProvider>
    );
  }
  return (
    <SessionProvider>
      <TierConfigLoader />
      <TokenSync />
      {children}
    </SessionProvider>
  );
}
