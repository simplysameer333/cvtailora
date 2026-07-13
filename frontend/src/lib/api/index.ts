// Barrel — keeps every existing `@/lib/api` import working after the
// domain split (2026-07-13, SOLID/no-very-large-files).

export { default } from "./client";
export * from "./client";
export * from "./tiers";
export * from "./cvScore";
export * from "./linkedin";
export * from "./builder";
export * from "./professions";
export * from "./auth";
export * from "./jobs";
export * from "./account";
export * from "./alerts";
export * from "./admin";
export * from "./templates";
export * from "./tools";
