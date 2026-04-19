import { landingCopy } from "@/lib/landing-copy";

export function SocialProofSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
      <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center dark:border-white/10 dark:bg-white/[0.03]">
        <blockquote className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          {landingCopy.socialProof.statement}
        </blockquote>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {landingCopy.socialProof.badges.map((badge) => (
            <span key={badge} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
              {badge}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
