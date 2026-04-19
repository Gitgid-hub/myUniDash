import { Bolt, LayoutTemplate, Sparkles } from "lucide-react";
import { landingCopy } from "@/lib/landing-copy";

const icons = [Sparkles, Bolt, LayoutTemplate];

export function FocusSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-8 dark:border-white/10 dark:from-white/[0.03] dark:to-transparent">
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{landingCopy.focus.title}</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {landingCopy.focus.items.map((item, index) => {
            const Icon = icons[index];
            return (
              <article key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.02]">
                <Icon className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                <h3 className="mt-3 text-lg font-semibold text-slate-900 dark:text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">{item.description}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
