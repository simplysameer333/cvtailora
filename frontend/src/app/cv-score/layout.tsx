import { Suspense } from "react";
import SidebarShell from "@/components/SidebarShell";

export const metadata = {
  title: "Free CV Score — CVTailora",
  description: "Instant AI-powered CV analysis. Get scored on ATS compatibility, content quality, design, skills, experience and more. Free, no sign-in required.",
};

export default function CvScoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarShell>
      <Suspense>{children}</Suspense>
    </SidebarShell>
  );
}
