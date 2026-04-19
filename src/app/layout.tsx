import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "@/components/providers";

export const metadata: Metadata = {
  title: "School OS | School, organized.",
  description:
    "A modern dashboard for first-year STEM students juggling 6+ courses. Track assignments, deadlines, and risk in one place.",
  openGraph: {
    title: "School OS | School, organized.",
    description:
      "A modern dashboard for first-year STEM students juggling 6+ courses. Track assignments, deadlines, and risk in one place.",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "School OS | School, organized.",
    description:
      "A modern dashboard for first-year STEM students juggling 6+ courses. Track assignments, deadlines, and risk in one place."
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
