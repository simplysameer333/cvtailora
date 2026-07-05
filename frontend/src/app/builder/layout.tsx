import SidebarShell from "@/components/SidebarShell";
import StepBar from "@/components/StepBar";
import JobContextBanner from "@/components/JobContextBanner";
import SessionGuard from "./SessionGuard";
import AuthGuard from "@/components/AuthGuard";

export default function BuilderLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarShell>
      <AuthGuard />
      <SessionGuard />
      {/* Step bar card on top, page content below (SidebarShell centers the workspace) */}
      <div className="w-full space-y-6">
        <StepBar />
        <JobContextBanner />
        {children}
      </div>
    </SidebarShell>
  );
}
