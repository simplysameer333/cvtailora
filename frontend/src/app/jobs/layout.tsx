import { Suspense } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AuthGuard from "@/components/AuthGuard";

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <AuthGuard />
      <Navbar />
      <main className="flex-1 max-w-5xl mx-auto w-full px-5 sm:px-6 py-6 sm:py-10">
        <Suspense>{children}</Suspense>
      </main>
      <Footer />
    </div>
  );
}
