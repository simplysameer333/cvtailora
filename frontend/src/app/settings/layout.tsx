import { FiSettings } from "react-icons/fi";
import SidebarShell from "@/components/SidebarShell";
import AuthGuard from "@/components/AuthGuard";
import PageBanner from "@/components/PageBanner";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarShell>
      <AuthGuard />
      <div className="w-full space-y-5 px-4 sm:px-0">
        <PageBanner
          icon={FiSettings}
          title="Settings"
          subtitle="Manage your account, plan, usage and job alerts."
        />
        {children}
      </div>
    </SidebarShell>
  );
}
