import Link from "next/link";
import Logo from "./Logo";

const LINKS = [
  { title: "Tools", items: [
    { href: "/cv-score",        label: "CV Score" },
    { href: "/builder/upload",  label: "CV Builder" },
    { href: "/cover-letter",    label: "Cover Letter" },
    { href: "/interview-prep",  label: "Interview Prep" },
    { href: "/jobs",            label: "Find Jobs" },
  ]},
  { title: "Account", items: [
    { href: "/auth/register",     label: "Sign up free" },
    { href: "/auth/login",        label: "Sign in" },
    { href: "/settings/overview", label: "Settings" },
  ]},
  { title: "Plans", items: [
    { href: "/auth/register?plan=free", label: "Free" },
    { href: "/auth/register?plan=plus", label: "Plus" },
    { href: "/auth/register?plan=pro",  label: "Pro" },
  ]},
];

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white mt-12 hidden sm:block">
      <div className="w-full px-6 sm:px-10 py-6">
        <div className="flex flex-col lg:flex-row lg:items-start gap-6 lg:gap-16">
          <div className="max-w-xs">
            <Logo />
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              AI-powered resume builder that tailors your CV to every job description using multi-model quality evaluation.
            </p>
          </div>
          <div className="flex-1 flex flex-wrap gap-x-16 gap-y-4">
            {LINKS.map(({ title, items }) => (
              <div key={title}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{title}</p>
                <ul className="space-y-1.5">
                  {items.map(({ href, label }) => (
                    <li key={href}>
                      <Link href={href} className="text-sm text-slate-600 hover:text-brand-600 transition">{label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="text-xs text-slate-400 lg:text-right shrink-0">
            <p>© {new Date().getFullYear()} TailorMyCv. All rights reserved.</p>
            <p className="mt-1">Built with multi-model AI</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
