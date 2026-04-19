/** Stacked flashcards cue (generic — not the Anki® trademark logo). */
export function AnkiExportIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 8.5c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2v7c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2v-7z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        opacity="0.45"
      />
      <path
        d="M7 10.5c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2v6c0 1.1-.9 2-2 2H9c-1.1 0-2-.9-2-2v-6z"
        fill="currentColor"
        opacity="0.2"
      />
      <path
        d="M7 10.5c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2v6c0 1.1-.9 2-2 2H9c-1.1 0-2-.9-2-2v-6z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
