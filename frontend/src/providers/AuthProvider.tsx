"use client";
import { SessionProvider, useSession } from "next-auth/react";
import { useEffect } from "react";
import { setApiToken } from "@/lib/api";
import DevProvider from "./DevProvider";

const DEV = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";

function TokenSync() {
  const { data: session } = useSession();
  useEffect(() => {
    setApiToken(session?.accessToken ?? null);
  }, [session?.accessToken]);
  return null;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  if (DEV) {
    // Dev bypass: no NextAuth cookie dance, no Google OAuth required.
    return <DevProvider>{children}</DevProvider>;
  }
  return (
    <SessionProvider>
      <TokenSync />
      {children}
    </SessionProvider>
  );
}
