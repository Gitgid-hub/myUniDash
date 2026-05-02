/**
 * **Demo catch-up only** (owner “Demo catch-up” on the calendar). Production weekly catch-up uses real time.
 *
 * Virtual “now” is fixed **after** the last Sun–Thu session of a chosen test week so QA can open the modal
 * without waiting for the real calendar (same idea as “Thursday after the last session”, but pinned to one week).
 *
 * **When to change:** If this week has no lecture/tutorial rows in your data, bump to another Sun–Thu block
 * that does (e.g. next semester). Month is 0-based in `Date`.
 */
export function getDemoWeeklyCatchupVirtualNow(): Date {
  // Thu 7 May 2026, 13:05 local — week Sun 3 May – Thu 7 May 2026, after a ~1:00 PM last session.
  return new Date(2026, 4, 7, 13, 5, 0, 0);
}
