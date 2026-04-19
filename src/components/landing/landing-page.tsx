"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";
import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { FeaturesSection } from "@/components/landing/features-section";
import { FocusSection } from "@/components/landing/focus-section";
import { ProOutcomesSection } from "@/components/landing/pro-outcomes";
import { PricingSection } from "@/components/landing/pricing-section";
import { SocialProofSection } from "@/components/landing/social-proof";
import { FaqSection } from "@/components/landing/faq-section";
import { FinalCtaSection } from "@/components/landing/final-cta-section";
import { Footer } from "@/components/landing/footer";

export function LandingPage() {
  useEffect(() => {
    trackEvent("view_landing", { path: "/" });
  }, []);

  return (
    <div className="bg-[radial-gradient(circle_at_20%_0%,rgba(56,189,248,0.12),transparent_45%),radial-gradient(circle_at_100%_0%,rgba(244,114,182,0.08),transparent_40%),linear-gradient(180deg,#f8fafc_0%,#ffffff_30%,#f8fafc_100%)] text-slate-900 dark:bg-[radial-gradient(circle_at_20%_0%,rgba(56,189,248,0.15),transparent_45%),radial-gradient(circle_at_100%_0%,rgba(244,114,182,0.10),transparent_42%),linear-gradient(180deg,#020617_0%,#020617_100%)] dark:text-white">
      <Navbar />
      <main>
        <Hero />
        <FeaturesSection />
        <FocusSection />
        <ProOutcomesSection />
        <PricingSection />
        <SocialProofSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <Footer />
    </div>
  );
}
