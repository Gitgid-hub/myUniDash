import { landingCopy } from "@/lib/landing-copy";
import { WaitlistForm } from "@/components/landing/waitlist-form";

export function FinalCtaSection() {
  return (
    <section id="waitlist" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
      <div className="grid gap-8 rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50/50 p-6 md:grid-cols-[1fr_420px] md:p-10 dark:border-white/10 dark:from-white/[0.03] dark:via-white/[0.01] dark:to-sky-500/10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600 dark:text-sky-400">Waitlist</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900 dark:text-white">{landingCopy.finalCta.title}</h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">{landingCopy.finalCta.subtitle}</p>
        </div>
        <WaitlistForm />
      </div>
    </section>
  );
}
