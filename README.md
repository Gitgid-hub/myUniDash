# School OS Landing Page

Apple-inspired, conversion-focused landing page for **School OS** (task + deadline manager for first-year STEM students with 6+ courses).

## Run

```bash
cd /Users/gids/Documents/myUniDash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## What is included

- Single-page scroll landing with anchored nav
- Sections: Hero, Features, Focus, Pro Outcomes, Pricing, Social Proof, FAQ, Final Waitlist CTA
- Minimal waitlist form (email required, university/year optional)
- Local waitlist persistence via `localStorage`
- Analytics stubs (`view_landing`, `click_cta_primary`, `submit_waitlist`)
- Light/dark mode toggle

## Where to edit copy

All landing copy is centralized in:

- `/Users/gids/Documents/myUniDash/src/lib/landing-copy.ts`

## Waitlist data and swap-to-backend point

- Local storage adapter: `/Users/gids/Documents/myUniDash/src/lib/waitlist-storage.ts`
- Replace `submitWaitlist(...)` implementation with your real API call when ready.

## Analytics hooks

- Stub tracker: `/Users/gids/Documents/myUniDash/src/lib/analytics.ts`
- Replace `trackEvent(...)` internals with your analytics provider.

## Key files

- `/Users/gids/Documents/myUniDash/src/app/layout.tsx`
- `/Users/gids/Documents/myUniDash/src/app/page.tsx`
- `/Users/gids/Documents/myUniDash/src/app/globals.css`
- `/Users/gids/Documents/myUniDash/src/components/landing/landing-page.tsx`
- `/Users/gids/Documents/myUniDash/src/components/landing/navbar.tsx`
- `/Users/gids/Documents/myUniDash/src/components/landing/hero.tsx`
- `/Users/gids/Documents/myUniDash/src/components/landing/features-section.tsx`
- `/Users/gids/Documents/myUniDash/src/components/landing/focus-section.tsx`
- `/Users/gids/Documents/myUniDash/src/components/landing/pro-outcomes.tsx`
- `/Users/gids/Documents/myUniDash/src/components/landing/pricing-section.tsx`
- `/Users/gids/Documents/myUniDash/src/components/landing/social-proof.tsx`
- `/Users/gids/Documents/myUniDash/src/components/landing/faq-section.tsx`
- `/Users/gids/Documents/myUniDash/src/components/landing/final-cta-section.tsx`
- `/Users/gids/Documents/myUniDash/src/components/landing/waitlist-form.tsx`
- `/Users/gids/Documents/myUniDash/src/lib/landing-copy.ts`
- `/Users/gids/Documents/myUniDash/src/lib/analytics.ts`
- `/Users/gids/Documents/myUniDash/src/lib/waitlist-storage.ts`
