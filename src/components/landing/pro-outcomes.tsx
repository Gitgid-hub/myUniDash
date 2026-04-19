import { ArrowUpRight } from "lucide-react";
import { landingCopy } from "@/lib/landing-copy";

export function ProOutcomesSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600 dark:text-sky-400">Pro</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{landingCopy.proOutcomes.title}</h2>
        <p className="mt-3 text-slate-600 dark:text-slate-300">{landingCopy.proOutcomes.subtitle}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {landingCopy.proOutcomes.items.map((item) => (
          <article key={item.title} className="group rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-1 hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{item.title}</h3>
              <ArrowUpRight className="h-4 w-4 text-slate-400 transition group-hover:text-slate-700 dark:group-hover:text-slate-200" />
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{item.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
