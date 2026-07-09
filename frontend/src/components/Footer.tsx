import Link from "next/link";
import Logo from "./Logo";

const LINKS = [
  { href: "/cv-score",        label: "CV Score" },
  { href: "/builder/upload",  label: "CV Builder" },
  { href: "/cover-letter",    label: "Cover Letter" },
  { href: "/interview-prep",  label: "Interview Prep" },
  { href: "/jobs",            label: "Find Jobs" },
  { href: "/settings/overview", label: "Settings" },
];

export default function Footer() {
  return (
    /* No top margin — the shell's main area provides spacing; a margin here
       forces a scrollbar on pages that otherwise fit the viewport.
       pb-20 on mobile clears the fixed BottomNav. */
    <footer className="border-t border-slate-200 bg-white pb-20 sm:pb-0">
      <div className="w-full px-5 sm:px-10 py-3.5 flex flex-col lg:flex-row items-center gap-3 lg:gap-8">
        <Logo />
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 flex-1">
          {LINKS.map(({ href, label }) => (
            <Link key={href} href={href} className="text-sm text-slate-600 hover:text-brand-600 transition">
              {label}
            </Link>
          ))}
        </nav>
        <div className="text-xs text-slate-400 text-center lg:text-right">
          <p>© {new Date().getFullYear()} CVTailora. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
