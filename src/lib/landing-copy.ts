export const landingCopy = {
  productName: "School OS",
  nav: {
    features: "Features",
    pricing: "Pricing",
    faq: "FAQ",
    cta: "Join the waitlist"
  },
  hero: {
    eyebrow: "Built for first-year STEM",
    title: "School, organized.",
    subtitle:
      "A modern dashboard for first-year STEM students juggling 6+ courses. Track every assignment, see what is at risk, and stay ahead of deadlines.",
    primaryCta: "Join the waitlist",
    secondaryCta: "See how it works",
    microcopy: "Free to start. Pro unlocks risk alerts, syllabus import, and reminders."
  },
  whatItDoes: {
    title: "What it does",
    items: [
      {
        title: "One place for every course",
        description: "Manage 7-8 courses with shared context: tasks, notes, progress, and deadlines in one view."
      },
      {
        title: "Deadlines you can trust",
        description: "See upcoming work in list and calendar views, plus a seven-day agenda that updates instantly."
      },
      {
        title: "Know what is at risk",
        description: "Smart risk alerts highlight what needs attention before it becomes last-minute panic."
      }
    ]
  },
  focus: {
    title: "Designed for focus",
    items: [
      {
        title: "Quiet by default",
        description: "Minimal visual noise, clear hierarchy, and only the details you need now."
      },
      {
        title: "Fast interactions",
        description: "Keyboard-first controls, quick add, and low-latency updates for daily flow."
      },
      {
        title: "Looks good anywhere",
        description: "Responsive layouts with tuned light and dark themes across desktop and mobile."
      }
    ]
  },
  proOutcomes: {
    title: "Pro outcomes",
    subtitle: "Pro is built around results, not feature bloat.",
    items: [
      {
        title: "Risk alerts",
        description: "Prevent last-minute panic with earlier warning windows and priority ranking."
      },
      {
        title: "Syllabus import",
        description: "Skip manual setup. Parse course plans and auto-create assignments and deadlines."
      },
      {
        title: "Calendar sync + reminders",
        description: "Sync with your calendar and send deadline nudges through WhatsApp or Telegram."
      },
      {
        title: "Accountability planner",
        description: "Build a stable weekly study rhythm with lightweight planning and follow-through."
      }
    ]
  },
  pricing: {
    title: "Simple pricing",
    free: {
      name: "Free",
      price: "$0",
      detail: "Always free to start",
      items: ["Course dashboard", "Tasks + deadlines", "Calendar + agenda", "Basic reminders"]
    },
    pro: {
      name: "Pro",
      price: "$6-10/mo",
      annual: "$59/year",
      detail: "Launch pricing for waitlist",
      items: ["Smart risk alerts", "AI syllabus parsing/import", "Calendar sync + WhatsApp/Telegram reminders", "Accountability study planner"]
    }
  },
  socialProof: {
    statement: "Built for the first-month chaos.",
    badges: ["Designed for 6+ courses", "Keyboard-first", "Dark mode"]
  },
  faq: {
    title: "FAQ",
    items: [
      {
        question: "Is it free?",
        answer: "Yes. School OS starts with a useful free tier for courses, tasks, calendar, and basic reminders."
      },
      {
        question: "When does Pro launch?",
        answer: "Pro launches first to waitlist members with launch pricing, then opens publicly after feedback and stability checks."
      },
      {
        question: "How do reminders work?",
        answer: "You choose reminder windows (for example 7 days, 3 days, 24 hours, 2 hours). Pro adds smarter risk-aware reminder logic."
      },
      {
        question: "Does it sync with Google or Apple Calendar?",
        answer: "Calendar sync is planned as a Pro capability. Waitlist users get access first during rollout."
      },
      {
        question: "What about privacy?",
        answer: "Your data is private by default. Local-first storage is used now, with clear controls as cloud sync is introduced later."
      },
      {
        question: "Will you offer campus pricing?",
        answer: "Yes. Campus bundle pricing (B2B2C) is planned for student organizations and partner programs."
      }
    ]
  },
  finalCta: {
    title: "Get launch access",
    subtitle: "Join the waitlist for early pricing and first access.",
    disclaimer: "No spam. Unsubscribe anytime."
  }
} as const;

export type LandingCopy = typeof landingCopy;
