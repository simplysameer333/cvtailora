import { Suspense } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Cover Letter Generator — TailorMyCv",
  description: "Generate a tailored cover letter in seconds. Paste your resume and the job description — AI does the rest.",
};

export default function CoverLetterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-5xl mx-auto w-full px-5 sm:px-6">
        <Suspense>{children}</Suspense>
      </main>
      <Footer />
    </div>
  );
}
