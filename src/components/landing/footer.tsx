import { landingCopy } from "@/lib/landing-copy";

export function Footer() {
  return (
    <footer className="border-t border-slate-200 py-8 dark:border-white/10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8 dark:text-slate-400">
        <p>{landingCopy.productName}</p>
        <p>Free to start. Pro for outcomes.</p>
      </div>
    </footer>
  );
}
