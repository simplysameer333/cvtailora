import { Suspense } from "react";
import SidebarShell from "@/components/SidebarShell";
import AuthGuard from "@/components/AuthGuard";

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarShell>
      <AuthGuard />
      <div className="w-full">
        <Suspense>{children}</Suspense>
      </div>
    </SidebarShell>
  );
}
