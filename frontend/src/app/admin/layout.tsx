import SidebarShell from "@/components/SidebarShell";
import AuthGuard from "@/components/AuthGuard";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarShell>
      <AuthGuard />
      {children}
    </SidebarShell>
  );
}
