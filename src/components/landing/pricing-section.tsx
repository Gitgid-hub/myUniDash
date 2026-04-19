import { Check } from "lucide-react";
import { landingCopy } from "@/lib/landing-copy";

export function PricingSection() {
  return (
    <section id="pricing" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
      <h2 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{landingCopy.pricing.title}</h2>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{landingCopy.pricing.free.name}</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight text-slate-900 dark:text-white">{landingCopy.pricing.free.price}</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{landingCopy.pricing.free.detail}</p>
          <ul className="mt-6 space-y-3 text-sm text-slate-700 dark:text-slate-200">
            {landingCopy.pricing.free.items.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 text-emerald-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-2xl border border-slate-900 bg-slate-900 p-6 text-white shadow-[0_22px_50px_rgba(2,6,23,0.35)] dark:border-white dark:bg-white dark:text-slate-900">
          <p className="text-sm font-semibold text-slate-300 dark:text-slate-500">{landingCopy.pricing.pro.name}</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight">{landingCopy.pricing.pro.price}</p>
          <p className="mt-1 text-sm text-slate-300 dark:text-slate-500">or {landingCopy.pricing.pro.annual}</p>
          <p className="mt-2 text-sm text-slate-300 dark:text-slate-500">{landingCopy.pricing.pro.detail}</p>
          <ul className="mt-6 space-y-3 text-sm">
            {landingCopy.pricing.pro.items.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 text-sky-300 dark:text-sky-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
