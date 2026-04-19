import { CalendarDays, Layers, ShieldAlert } from "lucide-react";
import { landingCopy } from "@/lib/landing-copy";

const icons = [Layers, CalendarDays, ShieldAlert];

export function FeaturesSection() {
  return (
    <section id="features" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
      <h2 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{landingCopy.whatItDoes.title}</h2>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {landingCopy.whatItDoes.items.map((item, index) => {
          const Icon = icons[index];
          return (
            <article
              key={item.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(2,6,23,0.06)] transition hover:-translate-y-1 hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.03]"
            >
              <Icon className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              <h3 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">{item.title}</h3>
              <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">{item.description}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
