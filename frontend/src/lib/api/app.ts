// Public, non-sensitive app config (currently just the display timezone).
import api from "./client";

export interface AppConfig {
  display_timezone: string;
}

export async function fetchAppConfig(): Promise<AppConfig> {
  const { data } = await api.get("/api/config/app");
  return data as AppConfig;
}
