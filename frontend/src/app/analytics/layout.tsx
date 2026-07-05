import SidebarShell from "@/components/SidebarShell";
import AuthGuard from "@/components/AuthGuard";

export const metadata = {
  title: "Analytics — TailorMyCv",
  description: "Summary of your automated actions — alert emails, tailored resumes, exports and more.",
};

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarShell>
      <AuthGuard />
      <div className="w-full">{children}</div>
    </SidebarShell>
  );
}
