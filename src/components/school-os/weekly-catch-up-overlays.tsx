"use client";

import { CatchUpWeekNotReadyModal } from "@/components/catch-up-week-not-ready-modal";
import { WeeklyCatchUpModal, type WeeklyCatchUpModalProps } from "@/components/weekly-catch-up-modal";
import type { SchoolDispatchAction } from "@/lib/store";
import type { SessionOccurrence } from "@/lib/calendar-occurrences";

export type WeeklyCatchUpOverlaysProps = {
  dispatch: (action: SchoolDispatchAction) => void;
  weeklyCatchUpOpen: boolean;
  weeklyCatchUpWeekLabel: string;
  weeklyCatchUpOccurrences: SessionOccurrence[];
  weeklyCatchUpDemo: boolean;
  alreadySubmitted: boolean;
  weeklyCatchUpAutoPrompt: boolean;
  onWeeklyCatchUpClose: () => void;
  onGenerate: WeeklyCatchUpModalProps["onGenerate"];
  onGoToTasks: WeeklyCatchUpModalProps["onGoToTasks"];
  catchUpWeekNotReadyOpen: boolean;
  catchUpWeekNotReadyWeekLabel: string;
  catchUpWeekNotReadyLastEnd: Date;
  onCatchUpWeekNotReadyClose: () => void;
};

export function WeeklyCatchUpOverlays({
  dispatch,
  weeklyCatchUpOpen,
  weeklyCatchUpWeekLabel,
  weeklyCatchUpOccurrences,
  weeklyCatchUpDemo,
  alreadySubmitted,
  weeklyCatchUpAutoPrompt,
  onWeeklyCatchUpClose,
  onGenerate,
  onGoToTasks,
  catchUpWeekNotReadyOpen,
  catchUpWeekNotReadyWeekLabel,
  catchUpWeekNotReadyLastEnd,
  onCatchUpWeekNotReadyClose
}: WeeklyCatchUpOverlaysProps) {
  return (
    <>
      <WeeklyCatchUpModal
        open={weeklyCatchUpOpen}
        weekLabel={weeklyCatchUpWeekLabel}
        occurrences={weeklyCatchUpOccurrences}
        demoMode={weeklyCatchUpDemo}
        alreadySubmitted={alreadySubmitted}
        autoPromptEnabled={weeklyCatchUpAutoPrompt}
        onAutoPromptChange={(next) => dispatch({ type: "set-weekly-catch-up-auto-prompt", payload: next })}
        onClose={onWeeklyCatchUpClose}
        onGenerate={onGenerate}
        onGoToTasks={onGoToTasks}
      />
      <CatchUpWeekNotReadyModal
        open={catchUpWeekNotReadyOpen}
        weekLabel={catchUpWeekNotReadyWeekLabel}
        lastSessionEnd={catchUpWeekNotReadyLastEnd}
        autoPromptEnabled={weeklyCatchUpAutoPrompt}
        onAutoPromptChange={(next) => dispatch({ type: "set-weekly-catch-up-auto-prompt", payload: next })}
        onClose={onCatchUpWeekNotReadyClose}
      />
    </>
  );
}
