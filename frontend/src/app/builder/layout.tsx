import { FiEdit3 } from "react-icons/fi";
import SidebarShell from "@/components/SidebarShell";
import StepBar from "@/components/StepBar";
import JobContextBanner from "@/components/JobContextBanner";
import PageBanner from "@/components/PageBanner";
import SessionGuard from "./SessionGuard";
import AuthGuard from "@/components/AuthGuard";

export default function BuilderLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarShell>
      <AuthGuard />
      <SessionGuard />
      {/* Emerald banner header with the step pills on the same band, page content below */}
      <div className="w-full space-y-5 px-4 sm:px-0">
        <PageBanner icon={FiEdit3} title="CV Builder">
          <StepBar />
        </PageBanner>
        <JobContextBanner />
        {children}
      </div>
    </SidebarShell>
  );
}
