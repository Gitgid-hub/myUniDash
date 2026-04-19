"use client";

import { trackEvent } from "@/lib/analytics";
import { landingCopy } from "@/lib/landing-copy";
import { ThemeToggle } from "@/components/landing/theme-toggle";

export function Navbar() {
  const links = [
    { href: "#features", label: landingCopy.nav.features },
    { href: "#pricing", label: landingCopy.nav.pricing },
    { href: "#faq", label: landingCopy.nav.faq }
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/70">
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8" aria-label="Main navigation">
        <a href="#top" className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
          {landingCopy.productName}
        </a>

        <div className="hidden items-center gap-5 md:flex">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="text-sm text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <a
            href="#waitlist"
            onClick={() => {
              trackEvent("click_cta_primary", { source: "nav" });
            }}
            className="inline-flex h-10 items-center rounded-full border border-slate-900 bg-slate-900 px-3 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-slate-700 dark:border-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 sm:px-4"
          >
            <span className="sm:hidden">Waitlist</span>
            <span className="hidden sm:inline">{landingCopy.nav.cta}</span>
          </a>
        </div>
      </nav>
    </header>
  );
}
