import Navbar from "@/components/Navbar";
import AuthGuard from "@/components/AuthGuard";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <AuthGuard />
      <Navbar />
      <div className="flex-1">{children}</div>
    </div>
  );
}
