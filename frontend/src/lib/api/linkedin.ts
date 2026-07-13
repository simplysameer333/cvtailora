// LinkedIn profile import.
import api from "./client";

// ── LinkedIn ────────────────────────────────────────────────────────────────────

export interface LinkedInProfile {
  full_name: string;
  headline: string;
  location: string;
  email: string;
  linkedin_url: string;
  summary: string;
  skills: string[];
  raw_text: string;
}

export async function parseLinkedInProfile(url: string): Promise<LinkedInProfile> {
  const { data } = await api.post("/api/linkedin/parse", { url });
  return data as LinkedInProfile;
}
