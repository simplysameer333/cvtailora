"use client";
import { useSessionExpiredHandler } from "@/lib/useSessionGuard";

export default function SessionGuard() {
  useSessionExpiredHandler();
  return null;
}
