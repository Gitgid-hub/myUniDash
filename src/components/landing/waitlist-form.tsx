"use client";

import { FormEvent, useState } from "react";
import { landingCopy } from "@/lib/landing-copy";
import { submitWaitlist } from "@/lib/waitlist-storage";
import { trackEvent } from "@/lib/analytics";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [university, setUniversity] = useState("");
  const [year, setYear] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!emailPattern.test(normalizedEmail)) {
      setStatus("error");
      setError("Please enter a valid email address.");
      return;
    }

    try {
      setStatus("submitting");
      await submitWaitlist({
        email: normalizedEmail,
        university: university.trim() || undefined,
        year: year.trim() || undefined,
        createdAt: new Date().toISOString()
      });
      trackEvent("submit_waitlist", {
        has_university: Boolean(university.trim()),
        has_year: Boolean(year.trim())
      });
      setStatus("success");
      setEmail("");
      setUniversity("");
      setYear("");
    } catch {
      setStatus("error");
      setError("Could not submit right now. Please try again.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]" noValidate>
      <div>
        <label htmlFor="waitlist-email" className="mb-1 block text-sm font-medium text-slate-800 dark:text-slate-100">
          Email
        </label>
        <input
          id="waitlist-email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
          placeholder="you@university.edu"
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/25 dark:border-white/15 dark:bg-white/5 dark:text-white"
        />
      </div>

      <div>
        <label htmlFor="waitlist-university" className="mb-1 block text-sm font-medium text-slate-800 dark:text-slate-100">
          University (optional)
        </label>
        <input
          id="waitlist-university"
          name="university"
          type="text"
          value={university}
          onChange={(event) => setUniversity(event.target.value)}
          placeholder="Hebrew University"
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/25 dark:border-white/15 dark:bg-white/5 dark:text-white"
        />
      </div>

      <div>
        <label htmlFor="waitlist-year" className="mb-1 block text-sm font-medium text-slate-800 dark:text-slate-100">
          Year (optional)
        </label>
        <input
          id="waitlist-year"
          name="year"
          type="text"
          value={year}
          onChange={(event) => setYear(event.target.value)}
          placeholder="First year"
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/25 dark:border-white/15 dark:bg-white/5 dark:text-white"
        />
      </div>

      <button
        type="submit"
        disabled={status === "submitting"}
        className="mt-1 inline-flex h-11 items-center justify-center rounded-full bg-slate-900 px-5 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
      >
        {status === "submitting" ? "Joining..." : "Join the waitlist"}
      </button>

      <p className="text-xs text-slate-500 dark:text-slate-400">{landingCopy.finalCta.disclaimer}</p>
      {status === "success" && <p className="text-sm text-emerald-600 dark:text-emerald-400">You are on the list. We will email you launch access.</p>}
      {status === "error" && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
    </form>
  );
}
