"use client";
import { useSyncExternalStore } from "react";
import { subscribeTierConfig, getTierConfigVersion } from "./tierConfig";

/**
 * Re-render the calling component whenever the live tier config loads/changes.
 * Returns a version number that bumps on each `setTierConfig` — read the actual
 * values via `getPricing()` / `getTierLimitDynamic()` after calling this so they
 * reflect the MongoDB config rather than the pre-load fallback.
 */
export function useTierConfigVersion(): number {
  return useSyncExternalStore(subscribeTierConfig, getTierConfigVersion, getTierConfigVersion);
}
