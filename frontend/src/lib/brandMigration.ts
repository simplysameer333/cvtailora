/**
 * One-time localStorage migration for the TailorMyCv → CVTailora rebrand
 * (2026-07-09). All keys moved from the `tailormycv_` prefix to `cvtailora_`;
 * this copies any legacy keys a returning visitor still has so in-flight
 * builder sessions survive the rebrand, then removes the old keys.
 *
 * Safe to call on every app boot: it no-ops once no legacy keys remain, and
 * never overwrites a value already written under the new prefix.
 */
const LEGACY_PREFIX = "tailormycv_";
const NEW_PREFIX = "cvtailora_";

export function migrateLegacyLocalStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const legacyKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LEGACY_PREFIX)) legacyKeys.push(key);
    }
    for (const oldKey of legacyKeys) {
      const newKey = NEW_PREFIX + oldKey.slice(LEGACY_PREFIX.length);
      if (localStorage.getItem(newKey) === null) {
        const value = localStorage.getItem(oldKey);
        if (value !== null) localStorage.setItem(newKey, value);
      }
      localStorage.removeItem(oldKey);
    }
  } catch {
    /* storage unavailable (private mode etc.) — nothing to migrate */
  }
}
