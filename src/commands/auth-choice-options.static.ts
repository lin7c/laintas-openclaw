// Static auth-choice option definitions used before provider manifests are loaded.
import type { AuthChoice, AuthChoiceGroupId } from "./onboard-types.js";

export type AuthChoiceOption = {
  value: AuthChoice;
  label: string;
  hint?: string;
  providerId?: string;
  groupId?: AuthChoiceGroupId;
  groupLabel?: string;
  groupHint?: string;
  assistantPriority?: number;
  assistantVisibility?: "visible" | "manual-only" | "detected-only";
  modelTarget?: "utility";
  onboardingFeatured?: boolean;
};

export type AuthChoiceGroup = {
  value: AuthChoiceGroupId;
  label: string;
  hint?: string;
  methodMessage?: string;
  providerIds?: string[];
  options: AuthChoiceOption[];
};

// laintas-openclaw: Laintas is the only model provider, and it contributes
// its auth choice from the bundled plugin manifest. Upstream's generic
// "Custom Provider" (custom-api-key) choice is removed so onboarding cannot
// configure a third-party endpoint.
export const CORE_AUTH_CHOICE_OPTIONS: ReadonlyArray<AuthChoiceOption> = [];

/**
 * Provider-agnostic auth choices that `--token-provider` binds to a concrete
 * provider method. They stay out of `CORE_AUTH_CHOICE_OPTIONS` because the
 * interactive picker only offers self-contained choices, but every CLI surface
 * must advertise and accept them even when no manifest contributes the same id.
 */
export const GENERIC_PROVIDER_AUTH_CHOICES: ReadonlyArray<AuthChoice> = [
  "setup-token",
  "token",
  "apiKey",
];

/** Format static auth-choice values for Commander help/validation text. */
export function formatStaticAuthChoiceChoicesForCli(): string {
  return [
    ...CORE_AUTH_CHOICE_OPTIONS.map((opt) => opt.value),
    ...GENERIC_PROVIDER_AUTH_CHOICES,
    "skip",
  ].join("|");
}
