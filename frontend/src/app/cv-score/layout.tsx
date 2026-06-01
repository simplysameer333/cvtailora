import { Suspense } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Free CV Score — TailorMyCv",
  description: "Instant AI-powered CV analysis. Get scored on ATS compatibility, content quality, design, skills, experience and more. Free, no sign-in required.",
};

export default function CvScoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Suspense>{children}</Suspense>
      </main>
      <Footer />
    </div>
  );
}
