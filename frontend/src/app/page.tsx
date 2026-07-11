"use client";
import Link from "next/link";
import {
  FiUpload, FiZap, FiDownload, FiCheckSquare, FiArrowRight,
  FiBriefcase, FiMail, FiBookOpen, FiLayout, FiLock, FiBell, FiFileText,
} from "react-icons/fi";
import AppShell from "@/components/AppShell";
import PricingTiers from "@/components/PricingTiers";

const steps = [
  {
    icon: FiUpload,
    title: "Upload Your Resume",
    desc: "PDF or DOCX — we extract everything automatically.",
    iconBg: "bg-brand-100",
    iconColor: "text-brand-600",
  },
  {
    icon: FiZap,
    title: "Multi-Agent AI Tailoring",
    desc: "AI agents collaboratively rewrite and review your resume until it's perfectly matched to the role.",
    iconBg: "bg-teal-100",
    iconColor: "text-teal-600",
  },
  {
    icon: FiDownload,
    title: "Download",
    desc: "Get a polished .docx in your chosen template, ready to send.",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
  },
];

const features = [
  { icon: FiCheckSquare, title: "Free CV Score",          desc: "54 AI checks across 8 categories — ATS, content, design, grammar. No sign-in needed.",        color: "text-teal-600 bg-teal-50" },
  { icon: FiZap,         title: "AI Tailoring",           desc: "Three AI models score and refine every resume until it beats your original.",                color: "text-amber-600 bg-amber-50" },
  { icon: FiBriefcase,   title: "Job Search Built In",    desc: "Search live roles from Indeed, LinkedIn and Glassdoor — tailor your CV in one click.",        color: "text-brand-600 bg-brand-50" },
  { icon: FiBell,        title: "Daily Job Alerts",       desc: "Save any search and get matching roles in your inbox every morning.",                        color: "text-rose-600 bg-rose-50" },
  { icon: FiMail,        title: "Cover Letters",          desc: "A tailored, three-paragraph cover letter for any role — in seconds.",                        color: "text-sky-600 bg-sky-50" },
  { icon: FiBookOpen,    title: "Interview Prep",         desc: "AI-generated questions based on your actual CV and the job description.",                    color: "text-violet-600 bg-violet-50" },
  { icon: FiLayout,      title: "20+ Templates",          desc: "Professional designs with live preview — download as DOCX or PDF.",                          color: "text-emerald-600 bg-emerald-50" },
  { icon: FiLock,        title: "Locked Facts",           desc: "Pin the details AI must never change. Your truth stays your truth.",                         color: "text-slate-600 bg-slate-100" },
];

const heroStats = [
  { value: "54", label: "quality checks per CV" },
  { value: "3", label: "AI models reviewing" },
  { value: "20+", label: "professional templates" },
  { value: "~60s", label: "to a tailored resume" },
];

export default function LandingPage() {
  return (
    <AppShell className="bg-white">

      {/* ── Hero — full-bleed deep teal, copy left / product preview right ── */}
      <section className="bg-brand-900 bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 text-white">
        <div className="w-full px-5 sm:px-10 xl:px-16 py-16 sm:py-20 flex flex-col lg:flex-row lg:items-center gap-10 lg:gap-12">

          {/* Left — copy */}
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left lg:flex-1 lg:min-w-0">
            <div className="inline-flex items-center gap-2 bg-white/10 text-teal-300 text-xs font-semibold px-3 py-1.5 rounded-full border border-white/15 mb-6">
              <FiZap className="w-3.5 h-3.5" /> Multi-Agent AI · Built for Job Seekers
            </div>
            <h1 className="text-3xl sm:text-5xl xl:text-6xl font-bold tracking-tight leading-tight">
              Land More Interviews with an{" "}
              <span className="text-teal-400">AI-Tailored</span> Resume
            </h1>
            <p className="mt-4 sm:mt-6 text-base sm:text-xl text-white/70 max-w-3xl">
              Paste a job description, upload your resume, and let a multi-agent AI pipeline
              rewrite, review, and polish it — crafted specifically for the role you want.
            </p>
            <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
              <Link href="/builder/upload" className="btn-accent text-base px-8 py-3">
                Start for Free <FiArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/cv-score"
                className="inline-flex items-center gap-2 rounded-lg border border-white/25 px-8 py-3 text-base font-semibold text-white hover:bg-white/10 transition"
              >
                <FiCheckSquare className="w-4 h-4" /> Score my CV — free
              </Link>
            </div>

            <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-6 w-full max-w-3xl">
              {heroStats.map(({ value, label }) => (
                <div key={label}>
                  <p className="text-2xl sm:text-3xl font-bold text-amber-400">{value}</p>
                  <p className="mt-1 text-xs sm:text-sm text-white/60">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right — product preview cards, pushed right; Job Match card fills
              the space to the LEFT of CV Score on wide screens (xl+) */}
          <div className="hidden lg:flex justify-end items-stretch gap-10 xl:gap-14 shrink-0">

            {/* Job Match card (shows xl and up) */}
            <div className="hidden xl:flex flex-col w-[360px] rounded-2xl bg-white text-slate-900 shadow-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Job Match</p>
                  <p className="text-sm text-slate-500 mt-0.5">roles matched by AI</p>
                </div>
                <div className="text-right">
                  <p className="text-4xl font-bold text-teal-600">94<span className="text-lg text-slate-400">%</span></p>
                  <p className="text-xs font-semibold text-teal-600">Excellent match</p>
                </div>
              </div>
              {[
                { role: "Senior Product Manager", company: "Stripe", pct: 94 },
                { role: "Growth PM",              company: "Notion", pct: 89 },
                { role: "Lead PM, Payments",      company: "Wise",   pct: 85 },
                { role: "Product Lead",           company: "Linear", pct: 82 },
              ].map(({ role, company, pct }) => (
                <div key={role} className="flex items-center justify-between mb-3">
                  <div className="min-w-0 pr-3">
                    <p className="font-medium text-slate-700 text-sm truncate">{role}</p>
                    <p className="text-xs text-slate-400 truncate">{company}</p>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 bg-teal-50 rounded-full px-2.5 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500" /> {pct}%
                  </span>
                </div>
              ))}
              <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 bg-brand-50 rounded-full px-2.5 py-1">
                  <FiBriefcase className="w-3 h-3" /> 12 new matches today
                </span>
                <span className="text-xs text-slate-400">live search</span>
              </div>
            </div>

            {/* CV Score card */}
            <div className="flex flex-col w-[360px] rounded-2xl bg-white text-slate-900 shadow-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">CV Score</p>
                  <p className="text-sm text-slate-500 mt-0.5">after AI tailoring</p>
                </div>
                <div className="text-right">
                  <p className="text-4xl font-bold text-teal-600">86<span className="text-lg text-slate-400">/100</span></p>
                  <p className="text-xs font-semibold text-teal-600">Strong — ready to send</p>
                </div>
              </div>
              {[
                { label: "Work Experience", pct: 88 },
                { label: "Skills Match",    pct: 92 },
                { label: "ATS Compatibility", pct: 85 },
                { label: "Professional Summary", pct: 80 },
                { label: "Design & Format", pct: 84 },
              ].map(({ label, pct }) => (
                <div key={label} className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-slate-600">{label}</span>
                    <span className="font-semibold text-slate-500">{pct}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-teal-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ))}
              <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 bg-amber-50 rounded-full px-2.5 py-1">
                  <FiZap className="w-3 h-3" /> 3 AI models agreed
                </span>
                <span className="text-xs text-slate-400">+31 vs original</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works — compact numbered process strip ── */}
      <section className="py-8 sm:py-11 px-5 sm:px-10 xl:px-16 bg-white">
        <div className="flex flex-col lg:flex-row lg:items-center gap-8 lg:gap-12">
          <div className="lg:w-64 shrink-0 text-center lg:text-left">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">How It Works</h2>
            <p className="mt-2 text-sm text-slate-500">Three steps. About a minute of your time.</p>
          </div>
          <div className="flex-1 flex flex-col md:flex-row items-stretch md:items-center gap-4">
            {steps.map(({ icon: Icon, title, desc, iconBg, iconColor }, i) => (
              <div key={i} className="flex items-center gap-4 flex-1">
                <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-surface px-5 py-4 flex-1 hover:border-teal-300 hover:shadow-sm transition">
                  <div className="relative shrink-0">
                    <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center`}>
                      <Icon className={`w-6 h-6 ${iconColor}`} />
                    </div>
                    <span className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-brand-700 text-white text-[11px] font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900 text-sm">{title}</h3>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </div>
                {i < steps.length - 1 && (
                  <FiArrowRight className="hidden md:block w-5 h-5 text-teal-500 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Feature showcase — same left-aligned header pattern as How It Works ── */}
      <section className="py-8 sm:py-11 px-5 sm:px-10 xl:px-16 bg-surface border-y border-slate-100">
        <div className="flex flex-col lg:flex-row lg:items-start gap-8 lg:gap-12">
          <div className="lg:w-64 shrink-0 text-center lg:text-left">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Everything you need to land the role</h2>
            <p className="mt-2 text-sm text-slate-500">
              One workspace for the whole application — score, tailor, apply, prepare.
            </p>
          </div>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {features.map(({ icon: Icon, title, desc, color }) => (
            <div key={title} className="card !p-5 hover:shadow-md transition-shadow">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-slate-900 text-sm mb-1">{title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
            </div>
          ))}
          </div>
        </div>
        <div className="mt-7 flex items-center justify-center gap-8 sm:gap-14 text-center flex-wrap">
          <div><p className="text-2xl font-bold text-brand-700"><FiFileText className="inline w-5 h-5 mr-1.5 -mt-1" />DOCX + PDF</p><p className="text-xs text-slate-400 mt-1">clean, ATS-safe exports</p></div>
          <div><p className="text-2xl font-bold text-brand-700">8 categories</p><p className="text-xs text-slate-400 mt-1">scored on every upload</p></div>
          <div><p className="text-2xl font-bold text-brand-700">1-click tailor</p><p className="text-xs text-slate-400 mt-1">straight from job listings</p></div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="py-9 sm:py-12 px-5 sm:px-10 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-6 sm:mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Simple, transparent pricing</h2>
            <p className="mt-3 text-slate-500 text-sm sm:text-base max-w-xl mx-auto">
              Start for free — no credit card required. Upgrade any time to unlock job search, resume library, and advanced AI features.
            </p>
          </div>
          <PricingTiers />
        </div>
      </section>

    </AppShell>
  );
}
