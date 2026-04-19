"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { landingCopy } from "@/lib/landing-copy";

export function FaqSection() {
  const [open, setOpen] = useState(0);

  return (
    <section id="faq" className="mx-auto w-full max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
      <h2 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{landingCopy.faq.title}</h2>
      <div className="mt-8 space-y-3">
        {landingCopy.faq.items.map((item, index) => {
          const expanded = open === index;
          return (
            <article key={item.question} className="rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
              <h3>
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? -1 : index)}
                  aria-expanded={expanded}
                  className="flex w-full items-center justify-between px-5 py-4 text-left text-base font-medium text-slate-900 dark:text-white"
                >
                  {item.question}
                  <ChevronDown className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} />
                </button>
              </h3>
              {expanded && <p className="px-5 pb-5 text-sm leading-7 text-slate-600 dark:text-slate-300">{item.answer}</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
