import { Suspense } from "react";
import SidebarShell from "@/components/SidebarShell";

export const metadata = {
  title: "Interview Prep — CVTailora",
  description: "Get AI-generated interview questions tailored to your resume and the job description. Know what to expect before you walk in.",
};

export default function InterviewPrepLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarShell>
      <div className="w-full">
        <Suspense>{children}</Suspense>
      </div>
    </SidebarShell>
  );
}
