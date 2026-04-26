import type { MainView } from "@/lib/types";

export type OnboardingPlacement = "auto" | "top" | "right" | "bottom" | "left";
export type OnboardingAction = "none" | "clickTarget";

export type OnboardingStep = {
  id: string;
  title: string;
  body: string;
  targetSelector?: string;
  placement?: OnboardingPlacement;
  action?: OnboardingAction;
  /** Optional UI setup before this step. */
  ensureView?: MainView;
  ensureUtilityOpen?: boolean;
};
