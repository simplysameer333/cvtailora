import { Suspense } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata = {
  title: "CV Score Results — TailorMyCv",
  description: "Your AI-powered CV analysis results — scores across 7 categories and 51 checks.",
};

export default function CvScoreResultLayout({ children }: { children: React.ReactNode }) {
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
