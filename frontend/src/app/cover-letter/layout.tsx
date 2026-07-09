import { Suspense } from "react";
import SidebarShell from "@/components/SidebarShell";

export const metadata = {
  title: "Cover Letter Generator — CVTailora",
  description: "Generate a tailored cover letter in seconds. Paste your resume and the job description — AI does the rest.",
};

export default function CoverLetterLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarShell>
      <div className="w-full">
        <Suspense>{children}</Suspense>
      </div>
    </SidebarShell>
  );
}
