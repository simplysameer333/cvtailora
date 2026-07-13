// Tier configuration (features/limits/pricing) — public fetch + admin update.
import api from "./client";

export interface CurrencyPricing {
  symbol: string;
  plus: number;
  pro: number;
}

export interface CurrencyZone {
  currency: string;
  timezones: string[];
  timezone_prefix: string;
  locale_codes: string[];
}

export interface TierConfigPayload {
  features: Record<string, string[]>;
  limits: Record<string, Record<string, number | null>>;
  feature_labels?: Record<string, string>;
  limit_labels?: Record<string, string>;
  pricing?: Record<string, CurrencyPricing>;
  currency_zones?: CurrencyZone[];
}

export async function fetchTierConfig(): Promise<TierConfigPayload> {
  const { data } = await api.get("/api/config/tiers");
  return data as TierConfigPayload;
}

export async function adminUpdateTierConfig(payload: {
  features: Record<string, string[]>;
  limits: Record<string, Record<string, number | null>>;
  pricing?: Record<string, CurrencyPricing>;
  currency_zones?: CurrencyZone[];
}): Promise<TierConfigPayload> {
  const { data } = await api.put("/api/admin/config/tiers", payload);
  return data as TierConfigPayload;
}
