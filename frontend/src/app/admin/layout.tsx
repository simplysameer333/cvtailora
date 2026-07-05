import SidebarShell from "@/components/SidebarShell";
import AuthGuard from "@/components/AuthGuard";
import { FiShield } from "react-icons/fi";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarShell>
      <AuthGuard />
      <div className="rounded-lg bg-brand-700 text-white mb-4">
        <div className="px-4 py-1.5 flex items-center gap-2">
          <FiShield className="w-3.5 h-3.5 opacity-80" />
          <span className="text-xs font-semibold tracking-wide uppercase opacity-90">
            Superadmin — Admin Dashboard
          </span>
        </div>
      </div>
      {children}
    </SidebarShell>
  );
}
