"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import AuthGuard from "@/components/AuthGuard";
import { FiGrid, FiCreditCard, FiChevronLeft } from "react-icons/fi";

const NAV_ITEMS = [
  { href: "/settings/overview", label: "Overview",     icon: FiGrid },
  { href: "/settings/plan",     label: "Plan & Usage", icon: FiCreditCard },
];

function UserAvatar({ name, email }: { name?: string | null; email?: string | null }) {
  const initials = name
    ? name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : email?.[0]?.toUpperCase() ?? "?";
  return (
    <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm shrink-0 select-none">
      {initials}
    </div>
  );
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useAuth();
  const user = session?.user;
  const tierLabel = user?.tier
    ? user.tier.charAt(0).toUpperCase() + user.tier.slice(1)
    : "Free";

  return (
    <div className="min-h-screen bg-slate-50">
      <AuthGuard />

      {/* ── Top bar ── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 h-14 flex items-center gap-3">
          <Link href="/" className="text-lg font-bold text-brand-600 shrink-0 leading-none">
            TailorMyCv
          </Link>
          <span className="text-slate-200 hidden sm:block text-lg font-light">/</span>
          <span className="text-sm font-medium text-slate-400 hidden sm:block">Settings</span>
          <Link
            href="/"
            className="ml-auto flex items-center gap-1 text-sm text-slate-400 hover:text-brand-600 transition-colors"
          >
            <FiChevronLeft className="w-3.5 h-3.5" />
            Back to app
          </Link>
        </div>
      </header>

      {/* ── Mobile tab bar ── */}
      <div className="md:hidden bg-white border-b border-slate-200 px-5 overflow-x-auto">
        <div className="flex gap-1 py-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                }`}
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8">
        <div className="flex gap-7 items-start">

          {/* ── Sidebar ── */}
          <aside className="w-56 shrink-0 hidden md:flex flex-col gap-4">

            {/* User identity card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center gap-3">
                <UserAvatar name={user?.name} email={user?.email} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate leading-snug">
                    {user?.name || "Account"}
                  </p>
                  <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-400">Current plan</span>
                <span className="text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-100 rounded-full px-2.5 py-0.5">
                  {tierLabel}
                </span>
              </div>
            </div>

            {/* Nav */}
            <nav className="bg-white rounded-2xl border border-slate-200 p-2 flex flex-col gap-0.5">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? "bg-brand-50 text-brand-700"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <item.icon
                      className={`w-4 h-4 shrink-0 ${isActive ? "text-brand-600" : "text-slate-400"}`}
                    />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>

          {/* ── Main content ── */}
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
