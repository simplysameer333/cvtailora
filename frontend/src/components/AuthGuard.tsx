"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { FiLoader } from "react-icons/fi";

/**
 * Mount inside any layout that requires authentication.
 * Redirects unauthenticated users to /auth/login preserving the intended URL.
 * Renders a full-screen spinner while the session is loading.
 * Renders nothing once authenticated — zero impact on layout.
 */
export default function AuthGuard() {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/auth/login?callbackUrl=${encodeURIComponent(pathname)}`);
    }
  }, [status, router, pathname]);

  if (status === "loading") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white z-50">
        <FiLoader className="w-6 h-6 animate-spin text-brand-600" />
      </div>
    );
  }

  return null;
}
