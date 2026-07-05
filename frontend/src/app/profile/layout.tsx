import SidebarShell from "@/components/SidebarShell";
import AuthGuard from "@/components/AuthGuard";

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarShell>
      <AuthGuard />
      <div className="w-full">{children}</div>
    </SidebarShell>
  );
}
