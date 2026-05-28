import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import AuthProvider from "@/providers/AuthProvider";

export const metadata: Metadata = {
  title: "TailorMyCv — AI Resume Builder",
  description: "Generate tailored, job-winning resumes using a multi-agent AI pipeline — Claude, GPT-4 & Gemini.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
          <Toaster position="top-right" />
        </AuthProvider>
      </body>
    </html>
  );
}
