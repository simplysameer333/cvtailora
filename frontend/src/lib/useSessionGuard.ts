"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export function useSessionExpiredHandler() {
  const router = useRouter();

  useEffect(() => {
    function handleExpired() {
      toast.error(
        "Your session has expired. Please start a new resume.",
        { duration: 5000, id: "session-expired" }
      );
      router.push("/builder/upload");
    }

    window.addEventListener("session-expired", handleExpired);
    return () => window.removeEventListener("session-expired", handleExpired);
  }, [router]);
}
